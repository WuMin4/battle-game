// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { ALL_CARDS, BASE_CARDS, SKILL_CARDS, getCardById } from './cards';
import { resolveTurn } from './engine';
import { Shield, Zap, Heart, Sword, FastForward, HelpCircle, X } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Add CSS variables for styling
const styles = `
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }
`;

function App() {
  const [gameState, setGameState] = useState({
    phase: 'lobby', // lobby, waiting_for_player, select_skill, wait_skills, battle, game_over
    roomId: '',
    isHost: false,
    vsAI: false,
    p1: null,
    p2: null,
    turn: 1,
    p1Card: null,
    p2Card: null,
    logs: [],
    winner: null,
    myOptions: [], // 2 random skill options
  });

  const [peerId, setPeerId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [peerError, setPeerError] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // Initial setup for Peer
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      // Someone joined my room
      connRef.current = conn;
      setupConnection(conn, true);
    });

    peer.on('error', (err) => {
      setPeerError(err.message);
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const createRoom = () => {
    setGameState(prev => ({ ...prev, roomId: peerId, isHost: true, phase: 'waiting_for_player' }));
  };

  const startAI = () => {
    const options = {
      p1Options: getRandomSkills(),
      p2Options: getRandomSkills(),
    };
    setGameState(prev => ({
      ...prev,
      roomId: 'AI_ROOM_' + Math.random().toString(36).slice(2, 8),
      isHost: true,
      vsAI: true,
      phase: 'select_skill',
      myOptions: options.p1Options,
      aiOptions: options.p2Options,
      p1: initPlayer(true),
      p2: initPlayer(false)
    }));
  };

  const joinRoom = () => {
    if (!joinId) return;
    const conn = peerRef.current.connect(joinId);
    connRef.current = conn;
    setupConnection(conn, false);
  };

  const getRandomSkills = () => {
      const s = [...SKILL_CARDS].sort(() => 0.5 - Math.random());
      return [s[0].id, s[1].id];
  };

  const setupConnection = (conn, isHost) => {
    conn.on('open', () => {
      if (isHost) {
        const options = {
          p1Options: getRandomSkills(),
          p2Options: getRandomSkills(),
        };
        conn.send({ type: 'START_SELECT_SKILLS', options });
        setGameState(prev => ({ 
          ...prev, 
          roomId: peerId, 
          isHost, 
          phase: 'select_skill',
          myOptions: options.p1Options,
          p1: initPlayer(true),
          p2: initPlayer(false)
        }));
      } else {
        setGameState(prev => ({ 
          ...prev, 
          roomId: joinId, 
          isHost, 
          phase: 'wait_initial_options',
          p1: initPlayer(false),
          p2: initPlayer(true)
        }));
      }
    });

    conn.on('data', (data) => {
      handleNetworkMessage(data, isHost);
    });
  };

  const initPlayer = (isHost) => ({
    hp: 3, maxHp: 4, energy: 1, maxEnergy: 4,
    skills: [], // the 1 chosen skill
    passives: [],
    cooldowns: {},
    usedDesperateCounter: false,
    wins: 0,
  });

  const sendMessage = (msg) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(msg);
    }
  };

  // State sync via ref to avoid stale closures in handleNetworkMessage
  const stateRef = useRef(gameState);
  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  const handleNetworkMessage = (data, isHost) => {
    const state = stateRef.current;
    
    if (data.type === 'START_SELECT_SKILLS') {
        if (!isHost) {
            setGameState(prev => ({ 
                ...prev, phase: 'select_skill', 
                myOptions: data.options.p2Options
            }));
        }
    } else if (data.type === 'SKILL_SELECTED') {
      if (isHost) {
        setGameState(prev => {
          const next = { ...prev, p2: { ...prev.p2, skills: [data.skill] } };
          if (next.p1.skills.length === 1) {
            return applyPreGameEffects(next);
          }
          return next;
        });
      } else {
        setGameState(prev => {
          const next = { ...prev, p2: { ...prev.p2, skills: [data.skill] } };
          // Client waits for BATTLE_START from Host
          return next;
        });
      }
    } else if (data.type === 'BATTLE_START') {
      setGameState(prev => ({ ...prev, ...data.state, phase: 'battle' }));
    } else if (data.type === 'CARD_SELECTED') {
      setGameState(prev => {
        const next = { ...prev, p2Card: data.card };
        if (next.p1Card) {
          return executeTurn(next);
        }
        return next;
      });
    } else if (data.type === 'TURN_RESULT') {
      // Received by client
      setGameState(prev => ({ ...prev, ...data.state }));
    } else if (data.type === 'PLAY_AGAIN') {
       if (isHost) {
          setGameState(prev => {
            const next = { ...prev, p2PlayAgain: true };
            if (next.p1PlayAgain) return resetGame(next);
            return next;
          });
       } else {
          setGameState(prev => {
            const next = { ...prev, p2PlayAgain: true };
            // Client waits for GAME_RESET
            return next;
          });
       }
    } else if (data.type === 'GAME_RESET') {
       if (!isHost) {
           setGameState(prev => ({ ...prev, ...data.state, phase: 'select_skill', myOptions: data.options.p2Options }));
       }
    }
  };

  const applyPreGameEffects = (state) => {
    let next = { ...state };
    
    // 何意味 transformations
    let p1HasMeaningless = next.p1.skills.includes('何意味');
    let p2HasMeaningless = next.p2.skills.includes('何意味');
    let p1Skill = next.p1.skills[0];
    let p2Skill = next.p2.skills[0];

    if (p1HasMeaningless && !p2HasMeaningless) {
       next.p1.skills = [p2Skill];
    } else if (p2HasMeaningless && !p1HasMeaningless) {
       next.p2.skills = [p1Skill];
    } // if both, they both stay 何意味.

    // Passives HP/Energy
    const applyPassives = (p, pOpponent) => {
      p.passives = p.skills.filter(s => getCardById(s)?.type === 'skill_passive');
      if (p.passives.includes('生命提升')) { p.hp += 1; p.maxHp += 1; }
      if (p.passives.includes('能量提升')) { p.energy += 1; p.maxEnergy += 1; }
      if (p.passives.includes('闪击战')) {
        p.hp += 1; p.maxHp += 1; p.energy += 2; p.maxEnergy += 2;
        pOpponent.hp += 1; pOpponent.maxHp += 1; pOpponent.energy += 1; pOpponent.maxEnergy += 1;
      }
      if (p.passives.includes('xxs')) {
        p.maxHp = Math.max(1, p.maxHp - 2); p.hp = p.maxHp;
        p.maxEnergy = Math.max(1, p.maxEnergy - 1); p.energy = p.maxEnergy;
      }
    };
    
    // Check P话哥 first to see if skills get discarded
    let p1HasP = next.p1.skills.includes('P话哥');
    let p2HasP = next.p2.skills.includes('P话哥');
    if (p1HasP || p2HasP) {
      next.p1.skills = [];
      next.p2.skills = [];
    }

    applyPassives(next.p1, next.p2);
    applyPassives(next.p2, next.p1);

    // If both have blitzkrieg, it stacks because we apply to each.

    next.phase = 'battle';
    if (next.isHost) sendMessage({ type: 'BATTLE_START', state: { p1: next.p2, p2: next.p1 } });
    return next;
  };

  const executeTurn = (state) => {
    // Both cards selected, resolve
    const result = resolveTurn({ ...state });
    
    let next = { ...state, p1: result.p1, p2: result.p2, logs: [...state.logs, ...result.logs], p1Card: null, p2Card: null, turn: state.turn + 1 };

    // Check win
    if (next.p1.hp <= 0 && next.p2.hp <= 0) {
      next.winner = 'draw';
      next.phase = 'game_over';
    } else if (next.p1.hp <= 0) {
      next.winner = 'p2';
      next.p2.wins += 1;
      next.phase = 'game_over';
    } else if (next.p2.hp <= 0) {
      next.winner = 'p1';
      next.p1.wins += 1;
      next.phase = 'game_over';
    }

    return next;
  };

  const resetGame = (state) => {
     let next = { 
       ...state, 
       p1: initPlayer(state.isHost), p2: initPlayer(!state.isHost),
       p1Card: null, p2Card: null, logs: [], winner: null, turn: 1, p1PlayAgain: false, p2PlayAgain: false
     };
     // Keep wins
     next.p1.wins = state.p1.wins;
     next.p2.wins = state.p2.wins;

     if (state.isHost) {
        const options = {
          p1Options: getRandomSkills(), p2Options: getRandomSkills()
        };
        if (state.vsAI) {
          next.aiOptions = options.p2Options;
        } else {
          sendMessage({ type: 'GAME_RESET', state: { p1: next.p2, p2: next.p1, winner: null, logs: [], turn: 1, p1PlayAgain: false, p2PlayAgain: false }, options });
        }
        next.myOptions = options.p1Options;
        next.phase = 'select_skill';
     }
     return next;
  };

  // UI Actions
  const handleSelectSkill = (skill) => {
    setGameState(prev => {
      let next = { ...prev, p1: { ...prev.p1, skills: [skill] }, phase: 'wait_skills' };
      
      if (next.vsAI) {
        const aiSkill = next.aiOptions[Math.floor(Math.random() * next.aiOptions.length)];
        next.p2.skills = [aiSkill];
        return applyPreGameEffects(next);
      } else {
        sendMessage({ type: 'SKILL_SELECTED', skill });
        if (next.isHost && next.p2.skills.length === 1) {
            return applyPreGameEffects(next);
        }
      }
      return next;
    });
  };

  const getAICard = (state) => {
    if (state.p2.forcedNextCard) return state.p2.forcedNextCard;
    const available = ALL_CARDS.filter(c => {
       if (c.type.startsWith('skill') && !state.p2.skills.includes(c.id)) return false;
       if (c.type === 'skill_passive') return false;
       if (state.p2.cooldowns[c.id] > 0) return false;
       if (state.p2.energy < (c.cost || 0)) return false;
       return true;
    });
    return available[Math.floor(Math.random() * available.length)].id;
  };

  const handlePlayCard = (cardId) => {
    setGameState(prev => {
      let next = { ...prev, p1Card: cardId };
      if (next.vsAI) {
        next.p2Card = getAICard(next);
        return executeTurn(next);
      } else {
        sendMessage({ type: 'CARD_SELECTED', card: cardId });
        if (next.p2Card) {
           return executeTurn(next);
        }
      }
      return next;
    });
  };

  const handlePlayAgain = () => {
     setGameState(prev => {
        let next = { ...prev, p1PlayAgain: true };
        if (next.vsAI) {
           return resetGame(next);
        } else {
           sendMessage({ type: 'PLAY_AGAIN' });
           if (next.p2PlayAgain && next.isHost) {
              return resetGame(next);
           }
        }
        return next;
     });
  };

  // Auto-play forced cards
  useEffect(() => {
    if (gameState.phase === 'battle' && !gameState.p1Card && gameState.p1?.forcedNextCard) {
      const timer = setTimeout(() => {
        handlePlayCard(gameState.p1.forcedNextCard);
        setGameState(prev => {
          if (!prev.p1) return prev;
          let nextP1 = { ...prev.p1 };
          nextP1.forcedNextCard = null;
          return { ...prev, p1: nextP1 };
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.phase, gameState.p1Card, gameState.p1?.forcedNextCard]);

  // Rendering blocks
  if (gameState.phase === 'lobby') {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4 font-sans">
        <style>{styles}</style>
        <div className="bg-neutral-800 p-8 rounded-2xl shadow-2xl max-w-md w-full animate-slide-up">
          <h1 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">决斗</h1>
          <div className="space-y-6">
            <div>
              <p className="text-neutral-400 text-sm mb-2">你的房间号</p>
              <div className="flex items-center gap-2 bg-neutral-950 p-3 rounded-xl border border-neutral-700">
                <code className="flex-1 font-mono text-lg">{peerId || '加载中...'}</code>
                <button onClick={() => navigator.clipboard.writeText(peerId)} className="p-2 hover:bg-neutral-800 rounded-lg transition">
                  复制
                </button>
              </div>
            </div>
            
            <button onClick={createRoom} disabled={!peerId} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition shadow-lg disabled:opacity-50">
              创建房间
            </button>
            
            <button onClick={startAI} className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition shadow-lg mt-4">
              单人游玩 (VS 电脑)
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-neutral-800 text-neutral-400">或</span>
              </div>
            </div>

            <div>
              <input 
                type="text" 
                placeholder="输入对方房间号" 
                value={joinId}
                onChange={e => setJoinId(e.target.value)}
                className="w-full bg-neutral-950 p-4 rounded-xl border border-neutral-700 mb-2 font-mono outline-none focus:border-orange-500 transition"
              />
              <button onClick={joinRoom} disabled={!joinId} className="w-full py-4 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl transition disabled:opacity-50">
                加入房间
              </button>
            </div>
            {peerError && <p className="text-red-500 text-sm text-center">{peerError}</p>}
            
            <button onClick={() => setShowTutorial(true)} className="w-full mt-2 py-3 text-neutral-400 hover:text-orange-400 flex items-center justify-center gap-2 transition font-bold rounded-xl hover:bg-neutral-800">
              <HelpCircle size={18} /> 查看游戏教程
            </button>
          </div>
        </div>
        {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      </div>
    );
  }

  if (gameState.phase === 'waiting_for_player') {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4 font-sans">
        <style>{styles}</style>
        <div className="bg-neutral-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center animate-slide-up">
          <h2 className="text-2xl font-bold mb-4">等待对方加入</h2>
          <p className="text-neutral-400 mb-6">将以下房间号发送给你的对手：</p>
          <div className="flex items-center gap-2 bg-neutral-950 p-3 rounded-xl border border-neutral-700 mb-4">
            <code className="flex-1 font-mono text-lg">{peerId}</code>
            <button onClick={() => navigator.clipboard.writeText(peerId)} className="p-2 hover:bg-neutral-800 rounded-lg transition">复制</button>
          </div>
          <div className="text-orange-400 animate-pulse mt-4">等待连接中...</div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'select_skill') {
    return <SkillSelectPhase onSelect={(sel) => handleSelectSkill(sel[0])} pool={SKILL_CARDS.filter(s => gameState.myOptions.includes(s.id))} required={1} title="选择你的技能牌" />;
  }

  if (gameState.phase === 'wait_initial_options' || gameState.phase === 'wait_skills') {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-xl animate-pulse text-neutral-400">等待对方操作...</div>
      </div>
    );
  }

  // Battle Phase and Game Over
  const { p1, p2, logs } = gameState;
  
  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col font-sans relative">
      {/* Header Info */}
      <header className="p-4 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center shadow-md">
         <div className="text-sm font-mono text-neutral-500">房间: {gameState.roomId}</div>
         <div className="text-lg font-bold">回合 {gameState.turn}</div>
         <div className="flex items-center gap-4">
           <div className="text-sm text-orange-400">你的胜场: {p1.wins} | 对方胜场: {p2.wins}</div>
           <button onClick={() => setShowTutorial(true)} className="text-neutral-400 hover:text-white transition" title="游戏教程">
             <HelpCircle size={22} />
           </button>
         </div>
      </header>

      {/* Opponent Locked Banner */}
      {gameState.p2Card && !gameState.p1Card && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-orange-900/80 px-6 py-2 rounded-full border border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)] z-50 flex items-center gap-3 pointer-events-none backdrop-blur-sm animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
            <span className="text-base font-bold text-orange-400">对方已出牌，等待您的决定...</span>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 max-w-7xl mx-auto w-full">
        {/* Left Column: Log */}
        <div className="md:w-1/3 bg-neutral-800 rounded-2xl flex flex-col border border-neutral-700 overflow-hidden shadow-xl">
           <div className="p-4 bg-neutral-900 font-bold border-b border-neutral-700">战斗记录</div>
           <div className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col">
              {[...logs].reverse().map((l, i) => (
                <div key={logs.length - 1 - i} className="text-sm bg-neutral-900 p-3 rounded-lg border border-neutral-800 text-neutral-300 animate-slide-up">
                  {l}
                </div>
              ))}
           </div>
        </div>

        {/* Right Column: Battle Area */}
        <div className="md:w-2/3 flex flex-col gap-4 relative">
           {/* Opponent Status */}
           <div className="bg-red-950/30 rounded-2xl p-6 border border-red-900/50 flex flex-col gap-4 shadow-inner relative overflow-hidden">
             <div className="flex justify-between items-center">
               <h2 className="text-2xl font-bold text-red-500">对方</h2>
               <div className="flex gap-4">
                 <Stat icon={<Heart size={20}/>} value={p2.hp} max={p2.maxHp} color="text-red-500" />
                 <Stat icon={<Zap size={20}/>} value={p2.energy} max={p2.maxEnergy} color="text-blue-400" />
               </div>
             </div>
             <div className="text-sm text-neutral-400 flex flex-wrap gap-2">
               技能: {p2.skills.map((s,i) => {
                 let desc = getCardById(s)?.desc;
                 if (s === '何意味' && p1.skills.includes('何意味')) desc = '你和对手都选择了滚木！';
                 return <span key={i} title={desc} className="cursor-help px-2 py-1 bg-neutral-800 rounded border border-neutral-700">{s}</span>
               })}
             </div>
             {gameState.p2Card && !gameState.p1Card && <div className="absolute top-4 left-20 text-orange-400 text-sm font-bold animate-bounce bg-orange-900/50 px-2 py-1 rounded">已准备就绪</div>}
           </div>

           {/* My Status */}
           <div className="bg-blue-950/30 rounded-2xl p-6 border border-blue-900/50 flex flex-col gap-4 shadow-inner">
             <div className="flex justify-between items-center">
               <h2 className="text-2xl font-bold text-blue-400">你</h2>
               <div className="flex gap-4">
                 <Stat icon={<Heart size={20}/>} value={p1.hp} max={p1.maxHp} color="text-red-500" />
                 <Stat icon={<Zap size={20}/>} value={p1.energy} max={p1.maxEnergy} color="text-blue-400" />
               </div>
             </div>
             <div className="text-sm text-neutral-400 flex flex-wrap gap-2">
               技能: {p1.skills.map((s,i) => {
                 let desc = getCardById(s)?.desc;
                 if (s === '何意味' && p2.skills.includes('何意味')) desc = '你和对手都选择了滚木！';
                 return <span key={i} title={desc} className="cursor-help px-2 py-1 bg-neutral-800 rounded border border-neutral-700">{s}</span>
               })}
             </div>
           </div>

           {/* Actions / Cards */}
           <div className="flex-1 bg-neutral-800 rounded-2xl p-6 border border-neutral-700 flex flex-col overflow-hidden">
             {gameState.phase === 'game_over' ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <h2 className="text-5xl font-black">
                    {gameState.winner === 'draw' ? '平局' : gameState.winner === 'p1' ? <span className="text-green-500">你赢了！</span> : <span className="text-red-500">你输了...</span>}
                  </h2>
                  <button onClick={handlePlayAgain} disabled={gameState.p1PlayAgain} className="px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition disabled:opacity-50 text-xl">
                    {gameState.p1PlayAgain ? '等待对方...' : '再来一局'}
                  </button>
                </div>
             ) : gameState.p1Card ? (
                <div className="flex items-center justify-center h-full text-2xl animate-pulse text-orange-400 font-bold bg-neutral-900/50 rounded-xl border border-orange-900">
                  已锁定出牌，等待对方...
                </div>
             ) : (
                <div className="flex-1 overflow-y-auto pr-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
                    {ALL_CARDS.map(card => {
                      if (card.type.startsWith('skill') && !p1.skills.includes(card.id)) return null;
                      
                      const isPassive = card.type === 'skill_passive';
                      const cooldown = p1.cooldowns[card.id] || 0;
                      const canAfford = p1.freeNextCard || p1.energy >= (card.cost || 0);
                      let isPlayable = !isPassive && cooldown === 0 && canAfford;
                      
                      if (p1.forcedNextCard) {
                          isPlayable = (p1.forcedNextCard === card.id);
                      }

                      return (
                        <button
                          key={card.id}
                          disabled={!isPlayable}
                          onClick={() => handlePlayCard(card.id)}
                          className={cn(
                            "relative flex flex-col p-4 rounded-xl text-left border-2 transition-all",
                            isPlayable 
                              ? "bg-neutral-900 border-neutral-600 hover:border-orange-500 hover:shadow-lg hover:-translate-y-1" 
                              : "bg-neutral-950 border-neutral-800 opacity-50 cursor-not-allowed grayscale",
                            card.type === 'base' ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-purple-500"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold">{card.name}</span>
                            {card.cost > 0 && <span className="flex items-center text-xs text-blue-400"><Zap size={12}/> {card.cost}</span>}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {card.type === 'skill_passive' && <span className="px-1.5 py-0.5 bg-neutral-700 text-neutral-300 rounded text-[10px]">被动</span>}
                            {card.type === 'skill_onetime' && <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded text-[10px]">一次性</span>}
                            {card.type === 'skill_reusable' && <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded text-[10px]">非一次性</span>}
                            {card.type === 'base' && <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-400 rounded text-[10px]">基础</span>}
                          </div>
                          <div className="text-xs text-neutral-400 line-clamp-3">{card.desc}</div>
                          {cooldown > 0 && cooldown !== Infinity && !p1.forcedNextCard && <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl font-bold text-red-500 text-lg backdrop-blur-[2px]">冷却中 ({cooldown})</div>}
                          {cooldown === Infinity && !p1.forcedNextCard && <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-xl font-bold text-red-600 text-lg backdrop-blur-[2px]">已消耗/被封印</div>}
                          {p1.forcedNextCard === card.id && <div className="absolute inset-0 bg-orange-900/60 border-2 border-orange-500 flex flex-col items-center justify-center rounded-xl font-bold text-orange-400 text-lg backdrop-blur-[2px] shadow-[0_0_15px_rgba(249,115,22,0.5)] animate-pulse">
                              <span>被【明牌】强制打出</span>
                              <span className="text-sm font-normal">不消耗能量</span>
                          </div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
             )}
           </div>
        </div>
      </div>
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </div>
  );
}

function Stat({ icon, value, max, color }) {
  return (
    <div className={cn("flex items-center gap-1 font-mono text-xl", color)}>
      {icon} <span>{value}/{max}</span>
    </div>
  );
}

function SkillSelectPhase({ onSelect, pool, required, title }) {
  const [selected, setSelected] = useState([]);
  
  // Need to clear selected if pool changes (new phase)
  useEffect(() => {
     setSelected([]);
  }, [pool]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length < required) return [...prev, id];
      return prev;
    });
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-8 flex flex-col items-center justify-center">
      <h2 className="text-3xl font-bold mb-8 text-orange-400">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {pool.map((c, i) => (
          <button
            key={i}
            onClick={() => toggleSelect(c.id)}
            className={cn(
              "p-8 rounded-2xl border-2 text-left transition-all relative overflow-hidden flex flex-col items-center text-center",
              selected.includes(c.id) 
                ? "bg-orange-900/30 border-orange-500 shadow-xl shadow-orange-900/20 scale-[1.02]" 
                : "bg-neutral-800 border-neutral-700 hover:border-neutral-500 hover:bg-neutral-700/50"
            )}
          >
            {selected.includes(c.id) && <div className="absolute top-4 right-4 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,1)]"></div>}
            <div className="font-black text-2xl mb-4 text-purple-400">{c.name}</div>
            <div className="text-base text-neutral-300 mb-6">{c.desc}</div>
            {c.cost > 0 ? (
                <div className="mt-auto px-4 py-2 bg-blue-900/30 text-blue-400 rounded-full flex items-center font-bold">
                    <Zap size={16} className="mr-2"/> 消耗 {c.cost} 能量
                </div>
            ) : (
                <div className="mt-auto px-4 py-2 bg-green-900/30 text-green-400 rounded-full flex items-center font-bold">
                    无需消耗能量
                </div>
            )}
            {c.type === 'skill_passive' && (
                <div className="mt-2 px-4 py-1 bg-neutral-700 text-neutral-300 rounded-full text-xs font-bold">
                    被动技能
                </div>
            )}
            {c.type === 'skill_onetime' && (
                <div className="mt-2 px-4 py-1 bg-red-900/30 text-red-400 rounded-full text-xs font-bold border border-red-900">
                    一次性
                </div>
            )}
            {c.type === 'skill_reusable' && (
                <div className="mt-2 px-4 py-1 bg-purple-900/30 text-purple-400 rounded-full text-xs font-bold border border-purple-900">
                    非一次性
                </div>
            )}
          </button>
        ))}
      </div>
      <button 
        disabled={selected.length !== required}
        onClick={() => onSelect(selected)}
        className="mt-12 px-16 py-5 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition shadow-xl disabled:opacity-50 text-2xl hover:scale-105 active:scale-95"
      >
        确认选择
      </button>
    </div>
  );
}

function TutorialModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-slide-up">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h2 className="text-xl font-bold text-orange-400 flex items-center gap-2"><HelpCircle size={20}/> 游戏教程</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-red-500 transition"><X size={24}/></button>
        </div>
        <div className="p-6 overflow-y-auto text-neutral-300 space-y-6 leading-relaxed text-sm sm:text-base">
          
          <section>
            <h3 className="text-lg font-bold text-white mb-2">一、 游戏目标</h3>
            <p>合理分配能量，猜测对方意图，率先将对方的生命值降至零即可获胜。</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-2">二、 游戏流程</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-orange-400">开局选择：</strong>系统随机提供两张技能牌，你需选择一张作为本局专属技能。</li>
              <li><strong className="text-orange-400">战斗阶段：</strong>双方初始拥有3点生命与1点能量。每回合双方同时暗出卡牌。</li>
              <li><strong className="text-orange-400">回合结算：</strong>卡牌同时亮出并结算，直至一方倒下。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-2">三、 卡牌限制与分类</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-orange-400">出牌限制：</strong>除“回能”外，任何打出的牌在下一回合都会进入冷却（禁止连续两回合使用同一张牌）。</li>
              <li><strong className="text-purple-400">被动技能：</strong>满足条件自动生效。</li>
              <li><strong className="text-red-400">一次性技能：</strong>整局仅限使用一次，用完永久封印。</li>
              <li><strong className="text-blue-400">非一次性技能：</strong>冷却完毕后可多次使用。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-2">四、 进阶与隐藏机制</h3>
            <div className="space-y-3 bg-neutral-800/50 p-4 rounded-lg border border-neutral-700">
              <p><strong className="text-orange-400">1. 能量优先扣除：</strong>能量消耗在所有效果前结算。若你的牌被对手“无效化”，已支付的能量<span className="text-red-400 font-bold">不会退还</span>。</p>
              <p><strong className="text-orange-400">2. 无效化与封印优先级：</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>明牌：</strong>全游戏最高优先级。必定无效对手的牌，并强制对手下回合免费打出该牌。</li>
                <li><strong>终·无懈可击：</strong>不仅无效，还会将该牌<span className="text-red-400 font-bold">永久封印</span>（但“回能”永远无法被永久封印）。</li>
              </ul>
              <p><strong className="text-orange-400">3. 反转的碰撞：</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>双方同时打出“反转”会互相抵消，白白浪费能量。</li>
                <li>“反转”只能窃取攻防疗等效果，<span className="text-red-400 font-bold">无法窃取回能效果</span>。</li>
              </ul>
              <p><strong className="text-orange-400">4. 伤害结算顺序：</strong>受到伤害时，防御手段触发顺序为：<strong>无敌 ➔ 反弹 ➔ 格挡</strong>（反弹会先减免3点，不足则反弹差值）。</p>
              <p><strong className="text-orange-400">5. 濒死结算：</strong>伤害和治疗全部计算完毕后，才判定是否死亡。若有“绝地反击”或满血复活被动，即使中途生命降至零以下，只要回合结束时触发被动即可存活。</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export default App;
