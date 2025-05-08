document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (保持不变) ---
    const playerDingDingDisplay = document.getElementById('player-dingding');
    const aiDingDingDisplay = document.getElementById('ai-dingding');
    const roundMessageDisplay = document.getElementById('round-message');
    const gameResultDisplay = document.getElementById('game-result');
    const actionCountdownDisplay = document.getElementById('action-countdown');

    const btnCharge = document.getElementById('btn-charge');
    const btnBiuBiu = document.getElementById('btn-biubiu');
    const btnDefend = document.getElementById('btn-defend');
    const btnStrongAttack = document.getElementById('btn-strong-attack');
    const btnStrongDefend = document.getElementById('btn-strong-defend');
    const btnRestart = document.getElementById('btn-restart');

    // --- Game State Variables (保持不变) ---
    let playerDingDings = 0;
    let aiDingDings = 0;
    let isGameOver = true;
    let currentRound = 0;

    const ACTION_CHARGE = 'CHARGE';
    const ACTION_BIUBIU = 'BIUBIU';
    const ACTION_DEFEND = 'DEFEND';
    const ACTION_STRONG_ATTACK = 'STRONG_ATTACK';
    const ACTION_STRONG_DEFEND = 'STRONG_DEFEND';

    let gameState = 'IDLE';
    const CLAP_DURATION = 1000;
    const ACTION_INPUT_DURATION = 700;
    let playerSelectedActionThisTurn = null;
    let clapTimeoutId = null;
    let actionInputTimeoutId = null;
    let countdownIntervalId = null;
    let actionPhaseStartTime = 0;

    // --- UI Update Function (保持不变) ---
    function updateUI() {
        playerDingDingDisplay.textContent = playerDingDings;
        aiDingDingDisplay.textContent = aiDingDings;

        const canAffordBiuBiu = playerDingDings >= 1;
        const canAffordStrongAttack = playerDingDings >= 3;
        const canAffordStrongDefend = playerDingDings >= 1;

        btnCharge.disabled = isGameOver || gameState !== 'ACTION_INPUT';
        btnBiuBiu.disabled = isGameOver || gameState !== 'ACTION_INPUT' || !canAffordBiuBiu;
        btnDefend.disabled = isGameOver || gameState !== 'ACTION_INPUT';
        btnStrongAttack.disabled = isGameOver || gameState !== 'ACTION_INPUT' || !canAffordStrongAttack;
        btnStrongDefend.disabled = isGameOver || gameState !== 'ACTION_INPUT' || !canAffordStrongDefend;
    }

    function updateActionCountdownDisplay() {
        if (gameState !== 'ACTION_INPUT' || isGameOver) {
            actionCountdownDisplay.textContent = '0.0s';
            clearInterval(countdownIntervalId);
            return;
        }
        const elapsedTime = Date.now() - actionPhaseStartTime;
        const remainingTime = Math.max(0, ACTION_INPUT_DURATION - elapsedTime);
        const remainingSeconds = (remainingTime / 1000).toFixed(1);
        actionCountdownDisplay.textContent = `${remainingSeconds}s`;
        if (remainingTime <= 0) {
            clearInterval(countdownIntervalId);
        }
    }

    // --- *** AI Logic (重点修改) *** ---
    function getAIAction() {
        // AI决策时可以知道玩家当前的丁丁数 (playerDingDings)
        // 这是一个相对简单的策略，比纯随机好一些

        // 1. 优先考虑防御对方的“刷刷”
        // 如果玩家有足够的丁丁放“刷刷”，且AI有丁丁放“大防”
        if (playerDingDings >= 3 && aiDingDings >= 1) {
            if (Math.random() < 0.7) { // 70%的概率出“大防”来应对潜在的“刷刷”
                return ACTION_STRONG_DEFEND;
            }
        }

        // 2. 考虑使用“刷刷” (如果AI有足够的丁丁)
        if (aiDingDings >= 3) {
            // 如果玩家丁丁少于1（无法“大防”），AI出“刷刷”的意愿增强
            const strongAttackChance = (playerDingDings < 1) ? 0.65 : 0.4;
            if (Math.random() < strongAttackChance) {
                return ACTION_STRONG_ATTACK;
            }
        }

        // 3. 考虑使用“biubiu” (如果AI有足够的丁丁)
        if (aiDingDings >= 1) {
            // 如果玩家丁丁少（可能无法“防防”或“大防”），或者玩家丁丁多（可能要出“刷刷”，AI选择biubiu试探或期望对方也出biubiu抵消）
            // 这里简化：如果没选择更优先的动作，有一定概率出biubiu
            if (Math.random() < 0.5) {
                return ACTION_BIUBIU;
            }
        }

        // 4. 考虑使用“防防” (如果玩家可能出“biubiu”)
        // 玩家有1或2个丁丁时，最可能出“biubiu”或“丁丁”
        if (playerDingDings >= 1 && playerDingDings < 3) {
            if (Math.random() < 0.4) { // 40%概率出“防防”
                return ACTION_DEFEND;
            }
        }
        
        // 5. 如果AI丁丁数为0，或者作为其他决策的补充，大概率“丁丁”蓄力
        if (aiDingDings < 1 || Math.random() < 0.7) { // 70%的概率（如果前面都没选）或者没丁丁时必选“丁丁”
            return ACTION_CHARGE;
        }

        // 6. 最后的回退选项是“防防”
        return ACTION_DEFEND;
    }


    // --- Resolve Turn Logic (保持不变) ---
    // 注意：这里的解决逻辑是基于“大防只防刷刷”的规则。
    // 如果AI因为逻辑缺陷错误地出了“大防”对抗玩家的“biubiu”，
    // 那么玩家的“biubiu”会命中。
    function resolveCurrentTurn(playerActionChoice) {
        gameState = 'RESOLVING';
        clearInterval(countdownIntervalId);
        actionCountdownDisplay.textContent = '0.0s';
        updateUI(); 

        const aiAction = getAIAction(); // AI根据新的逻辑选择动作
        let message = `回合 ${currentRound}: 你选择了 [${translateAction(playerActionChoice)}], AI选择了 [${translateAction(aiAction)}].`;
        let playerLoses = false;
        let aiLoses = false;

        // 成本和增益计算
        let playerActionCost = 0;
        if (playerActionChoice === ACTION_BIUBIU) playerActionCost = 1;
        else if (playerActionChoice === ACTION_STRONG_ATTACK) playerActionCost = 3;
        else if (playerActionChoice === ACTION_STRONG_DEFEND) playerActionCost = 1;

        let aiActionCost = 0;
        if (aiAction === ACTION_BIUBIU) aiActionCost = 1;
        else if (aiAction === ACTION_STRONG_ATTACK) aiActionCost = 3;
        else if (aiAction === ACTION_STRONG_DEFEND) aiActionCost = 1;
        
        // 先记录行动前的丁丁数，因为消耗和增加可能在同一步骤
        const pDDbeforeAction = playerDingDings;
        const aiDDbeforeAction = aiDingDings;

        playerDingDings -= playerActionCost;
        aiDingDings -= aiActionCost;

        if (playerActionChoice === ACTION_CHARGE) playerDingDings++;
        if (aiAction === ACTION_CHARGE) aiDingDings++;
        
        // --- 核心解决逻辑 ---
        if (playerActionChoice === ACTION_BIUBIU && aiAction === ACTION_BIUBIU) {
            message += " 双方biubiu抵消!";
        } else if (playerActionChoice === ACTION_STRONG_ATTACK && aiAction === ACTION_STRONG_ATTACK) {
            message += " 双方刷刷抵消!";
        }
        // 玩家行动判断
        else if (playerActionChoice === ACTION_BIUBIU) {
            if (aiAction === ACTION_DEFEND) { // AI防防
                message += " 你的biubiu被AI的防防挡住!";
            } else if (aiAction === ACTION_STRONG_ATTACK) { // AI刷刷 (克制biubiu)
                message += " 你的biubiu撞上AI的刷刷, 你输了!";
                playerLoses = true;
            } else { // AI是丁丁, 大防 (大防不防biubiu)
                message += " 你的biubiu击中AI!";
                aiLoses = true;
            }
        } else if (playerActionChoice === ACTION_STRONG_ATTACK) {
            if (aiAction === ACTION_STRONG_DEFEND) { // AI大防
                message += " 你的刷刷被AI的大防挡住!";
            } else { // AI是丁丁, 防防, biubiu
                message += " 你的刷刷击中AI!";
                aiLoses = true;
            }
        }
        // AI行动判断 (如果玩家未造成胜负，或玩家行动是蓄力/防御)
        else if (aiAction === ACTION_BIUBIU) { // 此时玩家是丁丁, 防防, 大防
            if (playerActionChoice === ACTION_DEFEND) { // 玩家防防
                message += " AI的biubiu被你的防防挡住!";
            } else if (playerActionChoice === ACTION_STRONG_ATTACK) {
                 // 此情况理论上已被上面玩家刷刷的逻辑覆盖并判定胜负
                 // 若到此，说明玩家的刷刷可能被抵消或防御（但本游戏抵消就结束了）
                 // 简单处理：若玩家刷刷有效，上面就赢了。若这里AI还能出招，说明玩家刷刷无效。
                 // 为避免逻辑混乱，此处应认为玩家的强力攻击未生效或双方强攻抵消，轮到AI。
                 // 但如果双方强攻抵消，游戏应该在那一步骤给出信息。
                 // 此处简化：AI的biubiu击中玩家（因为玩家的刷刷没打到）
                 message += " AI的biubiu击中了你! (你的强攻未命中或被化解)"; 
                 playerLoses = true;
            }
             else { // 玩家是丁丁, 大防
                message += " AI的biubiu击中了你!";
                playerLoses = true;
            }
        } else if (aiAction === ACTION_STRONG_ATTACK) { // 此时玩家是丁丁, 防防, 大防
            if (playerActionChoice === ACTION_STRONG_DEFEND) { // 玩家大防
                message += " AI的刷刷被你的大防挡住!";
            } else { // 玩家是丁丁, 防防
                message += " AI的刷刷击中了你!";
                playerLoses = true;
            }
        }
        // 双方都是蓄力或防御 (且非克制关系)
        else if ((playerActionChoice === ACTION_CHARGE || playerActionChoice === ACTION_DEFEND || playerActionChoice === ACTION_STRONG_DEFEND) &&
                 (aiAction === ACTION_CHARGE || aiAction === ACTION_DEFEND || aiAction === ACTION_STRONG_DEFEND)) {
            message += " 本回合平安无事.";
        }


        roundMessageDisplay.textContent = message;

        if (playerLoses) {
            gameResultDisplay.textContent = "你输了! 😭";
            gameResultDisplay.style.color = "red";
            isGameOver = true;
            gameState = 'IDLE';
        } else if (aiLoses) {
            gameResultDisplay.textContent = "你赢了! 🎉";
            gameResultDisplay.style.color = "green";
            isGameOver = true;
            gameState = 'IDLE';
        }

        updateUI(); 

        if (!isGameOver) {
            setTimeout(startNextRoundCycle, 1500); 
        }
    }
    
    function translateAction(action) {
        // (保持不变)
        switch(action) {
            case ACTION_CHARGE: return "丁丁";
            case ACTION_BIUBIU: return "biubiu";
            case ACTION_DEFEND: return "防防";
            case ACTION_STRONG_ATTACK: return "刷刷";
            case ACTION_STRONG_DEFEND: return "大防";
            default: return "未选";
        }
    }

    function handlePlayerActionChoice(chosenAction) {
        // (保持不变)
        if (gameState !== 'ACTION_INPUT') return; 
        clearTimeout(actionInputTimeoutId); 
        clearInterval(countdownIntervalId); 
        actionCountdownDisplay.textContent = '0.0s'; 
        playerSelectedActionThisTurn = chosenAction;
        roundMessageDisplay.textContent = `你选择了: [${translateAction(playerSelectedActionThisTurn)}] 等待AI...`; 
        resolveCurrentTurn(playerSelectedActionThisTurn);
    }

    function startNextRoundCycle() {
        // (保持不变)
        if (isGameOver) {
            updateUI(); 
            return;
        }
        currentRound++;
        gameState = 'CLAPPING';
        playerSelectedActionThisTurn = null; 
        roundMessageDisplay.textContent = `回合 ${currentRound}: 准备...【拍手】(思考中...)`;
        gameResultDisplay.textContent = "---"; 
        actionCountdownDisplay.textContent = (ACTION_INPUT_DURATION / 1000).toFixed(1) + 's'; 
        updateUI(); 
        clearTimeout(clapTimeoutId); 
        clapTimeoutId = setTimeout(() => {
            gameState = 'ACTION_INPUT';
            actionPhaseStartTime = Date.now(); 
            roundMessageDisplay.textContent = `回合 ${currentRound}: 【请操作!】`;
            updateUI(); 
            clearInterval(countdownIntervalId); 
            countdownIntervalId = setInterval(updateActionCountdownDisplay, 100); 
            updateActionCountdownDisplay(); 
            clearTimeout(actionInputTimeoutId); 
            actionInputTimeoutId = setTimeout(() => {
                if (gameState === 'ACTION_INPUT') { 
                    clearInterval(countdownIntervalId); 
                    actionCountdownDisplay.textContent = '0.0s';
                    roundMessageDisplay.textContent = `回合 ${currentRound}: 操作超时! 自动选择 [丁丁]`;
                    playerSelectedActionThisTurn = ACTION_CHARGE; 
                    resolveCurrentTurn(playerSelectedActionThisTurn);
                }
            }, ACTION_INPUT_DURATION);
        }, CLAP_DURATION);
    }

    function resetGame() {
        // (保持不变)
        clearTimeout(clapTimeoutId);
        clearTimeout(actionInputTimeoutId);
        clearInterval(countdownIntervalId); 
        playerDingDings = 0;
        aiDingDings = 0;
        currentRound = 0;
        isGameOver = false; 
        gameState = 'IDLE'; 
        roundMessageDisplay.textContent = "点击“开始游戏/重新开始”";
        gameResultDisplay.textContent = "---";
        actionCountdownDisplay.textContent = "0.0s"; 
        gameResultDisplay.style.color = "green"; 
        updateUI(); 
        btnRestart.textContent = "开始游戏"; 
    }
    
    function startGameHandler() {
        // (保持不变)
        if (gameState === 'IDLE' || isGameOver) { 
            resetGame(); 
            isGameOver = false; 
            btnRestart.textContent = "重新开始"; 
            startNextRoundCycle();
        }
    }

    // --- Event Listeners (保持不变) ---
    btnCharge.addEventListener('click', () => handlePlayerActionChoice(ACTION_CHARGE));
    btnBiuBiu.addEventListener('click', () => handlePlayerActionChoice(ACTION_BIUBIU));
    btnDefend.addEventListener('click', () => handlePlayerActionChoice(ACTION_DEFEND));
    btnStrongAttack.addEventListener('click', () => handlePlayerActionChoice(ACTION_STRONG_ATTACK));
    btnStrongDefend.addEventListener('click', () => handlePlayerActionChoice(ACTION_STRONG_DEFEND));
    btnRestart.addEventListener('click', startGameHandler);

    // --- Initial Setup (保持不变) ---
    resetGame(); 
});