import { getCardById } from './cards';

function getCardEffect(cardId, pSelf, pOpponent) {
  let eff = { energyChange: 0, heal: 0, damageToOpponent: 0, selfDamage: 0, block: 0, invincible: false, reflect: false, duel: false, cost: 0, unyielding: false, showHand: false };
  
  const card = getCardById(cardId);
  if (!card) return eff;
  eff.cost = card.cost || 0;

  switch(cardId) {
    case '回能': eff.energyChange = 1; break;
    case '自刎': eff.selfDamage = 1; eff.energyChange = 2; break;
    case '治疗': eff.heal = 1; break;
    case '攻击': eff.damageToOpponent = 1; break;
    case '强力击': eff.damageToOpponent = 2; break;
    case '超级无敌击': eff.damageToOpponent = 3; break;
    case '格挡': eff.block = 1; break;
    case '强力格挡': eff.block = 2; break;
    case '超级无敌格挡': eff.block = 3; break;
    
    case '终焉一击': eff.damageToOpponent = 4; break;
    case '无敌': eff.invincible = true; break;
    case '不屈': eff.unyielding = true; break;
    case '反弹': eff.reflect = true; break;
    case '决斗': eff.duel = true; break;
    case '生命回复': eff.heal = 1; break;
    case '明牌': eff.showHand = true; break;
  }
  return eff;
}

// Simple seeded RNG for synced randomness
function getSeededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  let seed = h ^ 0x5DEECE66D;
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export function resolveTurn(state) {
  const { p1, p2, p1Card, p2Card, roomId, turn } = state;
  const rng = getSeededRandom(roomId + "_" + turn);
  const logs = [];

  if (p1.forcedNextCard === p1Card) p1.forcedNextCard = null;
  if (p2.forcedNextCard === p2Card) p2.forcedNextCard = null;

  logs.push(`你打出了【${p1Card}】，对方打出了【${p2Card}】`);

  let p1Eff = getCardEffect(p1Card, p1, p2);
  let p2Eff = getCardEffect(p2Card, p2, p1);

  // Dynamic values
  if (p1Eff.unyielding) p1Eff.damageToOpponent = Math.max(0, p1.maxHp - p1.hp + 1);
  if (p2Eff.unyielding) p2Eff.damageToOpponent = Math.max(0, p2.maxHp - p2.hp + 1);

  // Pay costs (if they had enough, assume validated before playing)
  p1.energy -= p1Eff.cost;
  p2.energy -= p2Eff.cost;

  // Flawless check
  let p1Nullified = false;
  let p2Nullified = false;

  // 最高优先级: 明牌
  if (p1Card === '明牌') {
    p2Nullified = true;
    p2.forcedNextCard = p2Card;
    p2.freeNextCard = true;
    logs.push(`你的【明牌】使对方的牌无效！对方下回合将被迫打出此牌！`);
  }
  if (p2Card === '明牌') {
    p1Nullified = true;
    p1.forcedNextCard = p1Card;
    p1.freeNextCard = true;
    logs.push(`对方的【明牌】使你的牌无效！你下回合将被迫打出此牌！`);
  }

  if (p1Card === '无懈可击' || p1Card === '终·无懈可击') {
    if (!p1Nullified) {
      p2Nullified = true;
      logs.push(`你的【${p1Card}】使对方的牌无效！`);
    }
  }
  if (p2Card === '无懈可击' || p2Card === '终·无懈可击') {
    if (!p2Nullified) {
      p1Nullified = true;
      logs.push(`对方的【${p2Card}】使你的牌无效！`);
    }
  }

  // Reverse check
  let p1Reverse = (p1Card === '反转' && !p1Nullified);
  let p2Reverse = (p2Card === '反转' && !p2Nullified);

  if (p1Reverse && p2Reverse) {
    p1Nullified = true;
    p2Nullified = true;
    logs.push(`双方同时使用【反转】，效果抵消！`);
  } else if (p1Reverse) {
    if (!p2Nullified) {
      logs.push(`你的【反转】将对方的牌为你所用！`);
      p1Eff = { ...p2Eff, cost: p1Eff.cost, energyChange: 0 }; 
      p2Eff = { energyChange: p2Eff.energyChange, heal: 0, damageToOpponent: 0, selfDamage: 0, block: 0, invincible: false, reflect: false, duel: false, cost: p2Eff.cost }; 
    }
  } else if (p2Reverse) {
    if (!p1Nullified) {
      logs.push(`对方的【反转】将你的牌为其所用！`);
      p2Eff = { ...p1Eff, cost: p2Eff.cost, energyChange: 0 };
      p1Eff = { energyChange: p1Eff.energyChange, heal: 0, damageToOpponent: 0, selfDamage: 0, block: 0, invincible: false, reflect: false, duel: false, cost: p1Eff.cost };
    }
  }

  // Nullify clear
  if (p1Nullified) p1Eff = { energyChange: 0, heal: 0, damageToOpponent: 0, selfDamage: 0, block: 0, invincible: false, reflect: false, duel: false, cost: p1Eff.cost };
  if (p2Nullified) p2Eff = { energyChange: 0, heal: 0, damageToOpponent: 0, selfDamage: 0, block: 0, invincible: false, reflect: false, duel: false, cost: p2Eff.cost };

  // Free Next Card from 明牌
  if (p1.freeNextCard) { p1.energy += p1Eff.cost; p1.freeNextCard = false; logs.push(`你的【${p1Card}】不消耗能量。`); }
  if (p2.freeNextCard) { p2.energy += p2Eff.cost; p2.freeNextCard = false; logs.push(`对方的【${p2Card}】不消耗能量。`); }

  // Apply energy changes
  p1.energy += p1Eff.energyChange;
  p2.energy += p2Eff.energyChange;

  if (p1Eff.energyChange > 0) logs.push(`你回复了${p1Eff.energyChange}点能量。`);
  if (p2Eff.energyChange > 0) logs.push(`对方回复了${p2Eff.energyChange}点能量。`);

  // Calculate raw incoming damage
  let p1IncomingDmg = p2Eff.damageToOpponent + p1Eff.selfDamage;
  let p2IncomingDmg = p1Eff.damageToOpponent + p2Eff.selfDamage;

  function applyDamageModifiers(incomingDmg, eff, playerLogName) {
    let reflected = 0;
    if (eff.invincible) {
      if (incomingDmg > 0) logs.push(`${playerLogName}的无敌抵挡了所有伤害！`);
      incomingDmg = 0;
    } else if (eff.reflect && incomingDmg > 0) {
      let reduced = incomingDmg - 4;
      if (reduced < 0) {
        reflected = Math.abs(reduced);
        logs.push(`${playerLogName}的反弹触发！不受伤害并反弹了${reflected}点伤害！`);
        incomingDmg = 0;
      } else {
        logs.push(`${playerLogName}的反弹将受到的伤害减少了4点。`);
        incomingDmg = reduced;
      }
    } else {
      let block = eff.block || 0;
      if (block > 0) {
        logs.push(`${playerLogName}的格挡减少了${block}点受到的伤害。`);
        incomingDmg -= block;
      }
      if (incomingDmg < 0) incomingDmg = 0;
    }
    return { finalDmg: incomingDmg, reflected };
  }

  function getLuckEffect(playerLogName) {
    const val = rng() * 104;
    let eff = { damageToOpponent: 0, selfDamage: 0, healOpponent: 0, healSelf: 0, energyOpponent: 0, energySelf: 0, msg: '' };
    if (val < 20) { eff.damageToOpponent = 2; eff.msg = `${playerLogName}的【运】触发：对对方造成2伤害！`; }
    else if (val < 40) { eff.selfDamage = 1; eff.msg = `${playerLogName}的【运】触发：对自己造成1伤害！`; }
    else if (val < 60) { eff.healOpponent = 1; eff.msg = `${playerLogName}的【运】触发：为对方回复1生命！`; }
    else if (val < 80) { eff.healSelf = 2; eff.msg = `${playerLogName}的【运】触发：为自己回复2生命！`; }
    else if (val < 81) { eff.damageToOpponent = 999; eff.msg = `${playerLogName}的【运】触发：对对方造成999伤害！`; }
    else if (val < 82) { eff.selfDamage = 999; eff.msg = `${playerLogName}的【运】触发：对自己造成999伤害！`; }
    else if (val < 83) { eff.healOpponent = 999; eff.energyOpponent = 999; eff.msg = `${playerLogName}的【运】触发：为对方回复999生命与能量！`; }
    else if (val < 84) { eff.healSelf = 999; eff.energySelf = 999; eff.msg = `${playerLogName}的【运】触发：为自己回复999生命与能量！`; }
    else { eff.msg = `${playerLogName}的【运】触发：什么都没发生...`; }
    return eff;
  }

  let p1Luck = null, p2Luck = null;
  if (p1Card === '运' && !p1Nullified) { p1Luck = getLuckEffect('你'); logs.push(p1Luck.msg); }
  if (p2Card === '运' && !p2Nullified) { p2Luck = getLuckEffect('对方'); logs.push(p2Luck.msg); }

  if (p1Luck) {
    p2IncomingDmg += p1Luck.damageToOpponent; p1IncomingDmg += p1Luck.selfDamage;
    p1Eff.heal += p1Luck.healSelf; p2Eff.heal += p1Luck.healOpponent;
    p1.energy += p1Luck.energySelf; p2.energy += p1Luck.energyOpponent;
  }
  if (p2Luck) {
    p1IncomingDmg += p2Luck.damageToOpponent; p2IncomingDmg += p2Luck.selfDamage;
    p2Eff.heal += p2Luck.healSelf; p1Eff.heal += p2Luck.healOpponent;
    p2.energy += p2Luck.energySelf; p1.energy += p2Luck.energyOpponent;
  }

  function applyDamageModifiers(incomingDmg, eff, playerLogName) {
    let reflected = 0;
    if (eff.invincible) {
      if (incomingDmg > 0) logs.push(`${playerLogName}的无敌抵挡了所有伤害！`);
      incomingDmg = 0;
    } else if (eff.reflect && incomingDmg > 0) {
      let reduced = incomingDmg - 3;
      if (reduced < 0) {
        reflected = Math.abs(reduced);
        logs.push(`${playerLogName}的反弹触发！不受伤害并反弹了${reflected}点伤害！`);
        incomingDmg = 0;
      } else {
        logs.push(`${playerLogName}的反弹将受到的伤害减少了3点。`);
        incomingDmg = reduced;
      }
    } else {
      let block = eff.block || 0;
      if (block > 0) {
        logs.push(`${playerLogName}的格挡减少了${block}点受到的伤害。`);
        incomingDmg -= block;
      }
      if (incomingDmg < 0) incomingDmg = 0;
    }
    return { finalDmg: incomingDmg, reflected };
  }

  let p1Mod = applyDamageModifiers(p1IncomingDmg, p1Eff, '你');
  let p2Mod = applyDamageModifiers(p2IncomingDmg, p2Eff, '对方');

  // Apply damage
  if (p1Mod.finalDmg > 0) {
    p1.hp -= p1Mod.finalDmg;
    logs.push(`你受到了${p1Mod.finalDmg}点伤害。`);
  }
  if (p2Mod.finalDmg > 0) {
    p2.hp -= p2Mod.finalDmg;
    logs.push(`对方受到了${p2Mod.finalDmg}点伤害。`);
  }

  if (p2Mod.reflected > 0) {
    p1.hp -= p2Mod.reflected;
    logs.push(`你受到了被反弹的${p2Mod.reflected}点伤害。`);
  }
  if (p1Mod.reflected > 0) {
    p2.hp -= p1Mod.reflected;
    logs.push(`对方受到了被反弹的${p1Mod.reflected}点伤害。`);
  }

  // Healing
  if (p1Eff.heal > 0) {
    p1.hp += p1Eff.heal;
    logs.push(`你恢复了${p1Eff.heal}点生命值。`);
  }
  if (p2Eff.heal > 0) {
    p2.hp += p2Eff.heal;
    logs.push(`对方恢复了${p2Eff.heal}点生命值。`);
  }

  if (p1.delayedHeal && p1.delayedHeal.turn === turn) {
    p1.hp += p1.delayedHeal.amount;
    logs.push(`你因为生命回复的效果，恢复了${p1.delayedHeal.amount}点生命值。`);
    p1.delayedHeal = null;
  }
  if (p2.delayedHeal && p2.delayedHeal.turn === turn) {
    p2.hp += p2.delayedHeal.amount;
    logs.push(`对方因为生命回复的效果，恢复了${p2.delayedHeal.amount}点生命值。`);
    p2.delayedHeal = null;
  }

  if (p1Card === '生命回复' && !p1Nullified) p1.delayedHeal = { turn: turn + 1, amount: 1 };
  if (p2Card === '生命回复' && !p2Nullified) p2.delayedHeal = { turn: turn + 1, amount: 1 };

  // Duel
  if (p1Eff.duel) {
    p2.hp = Math.max(1, p1.hp);
    p1.hp = Math.max(1, p1.hp);
    logs.push(`你的【决斗】将对方的生命值变成了${p2.hp}！`);
  }
  if (p2Eff.duel) {
    p1.hp = Math.max(1, p2.hp);
    p2.hp = Math.max(1, p2.hp);
    logs.push(`对方的【决斗】将你的生命值变成了${p1.hp}！`);
  }

  // Passive: 持久战 (War of attrition)
  if (turn % 5 === 0) {
    if (p1.skills.includes('持久战')) { p1.hp += 1; p1.energy += 1; logs.push(`你的【持久战】触发，生命与能量+1！`); }
    if (p2.skills.includes('持久战')) { p2.hp += 1; p2.energy += 1; logs.push(`对方的【持久战】触发，生命与能量+1！`); }
  }

  // Cap HP and Energy
  p1.hp = Math.min(p1.hp, p1.maxHp);
  p2.hp = Math.min(p2.hp, p2.maxHp);
  p1.energy = Math.min(p1.energy, p1.maxEnergy);
  p2.energy = Math.min(p2.energy, p2.maxEnergy);

  // Desperate Counter (xxs, 绝地反击)
  const applyDeathDefy = (p, pLogName) => {
    if (p.hp <= 0 && p.skills.includes('xxs') && !p.usedXXS) {
      p.hp = p.maxHp; p.energy = p.maxEnergy; p.usedXXS = true;
      logs.push(`${pLogName}的【xxs】触发！满血复活！`);
    }
    if (p.hp <= 0 && p.skills.includes('绝地反击') && !p.usedDesperateCounter) {
      p.usedDesperateCounter = true;
      p.desperateDeathTurn = turn + 1;
      p.hp = 1; // temporarily stay alive
      logs.push(`${pLogName}的【绝地反击】触发！进入绝地状态，下回合结束后死亡！`);
    }
    // Check if desperate time is up
    if (p.usedDesperateCounter && turn >= p.desperateDeathTurn) {
      p.hp = 0;
      logs.push(`${pLogName}的【绝地反击】效果结束，生命归零`);
    }
  };

  applyDeathDefy(p1, '你');
  applyDeathDefy(p2, '对方');

  // Cooldowns
  for (let c in p1.cooldowns) if (p1.cooldowns[c] > 0) p1.cooldowns[c]--;
  for (let c in p2.cooldowns) if (p2.cooldowns[c] > 0) p2.cooldowns[c]--;

  function applyCooldown(player, cardId, isNullified, opponentUltimate) {
    if (!cardId) return;
    const card = getCardById(cardId);
    if (!card) return;
    
    if (card.type === 'skill_onetime') {
      player.cooldowns[cardId] = Infinity;
    } else if (cardId !== '回能') {
      player.cooldowns[cardId] = 1; // Next turn blocked
    }

    if (isNullified && cardId !== '回能') {
      if (opponentUltimate) {
        player.cooldowns[cardId] = Infinity;
        logs.push(`受终·无懈可击影响，【${cardId}】被永久封印！`);
      }
    }
  }

  applyCooldown(p1, p1Card, p1Nullified, p2Card === '终·无懈可击');
  applyCooldown(p2, p2Card, p2Nullified, p1Card === '终·无懈可击');

  return { p1, p2, logs };
}
