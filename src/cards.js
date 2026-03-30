export const BASE_CARDS = [
  { id: '回能', name: '回能', type: 'base', cost: 0, desc: '回复1能量，此牌无视下回合不能使用的限制' },
  { id: '自刎', name: '自刎', type: 'base', cost: 0, desc: '对自己造成1伤害，回复2能量' },
  { id: '治疗', name: '治疗', type: 'base', cost: 2, desc: '回复1生命' },
  { id: '攻击', name: '攻击', type: 'base', cost: 1, desc: '对对方造成1伤害' },
  { id: '强力击', name: '强力击', type: 'base', cost: 2, desc: '对对方造成2伤害' },
  { id: '超级无敌击', name: '超级无敌击', type: 'base', cost: 3, desc: '对对方造成3伤害' },
  { id: '格挡', name: '格挡', type: 'base', cost: 0, desc: '使本次受到的伤害减少1（最少为0）' },
  { id: '强力格挡', name: '强力格挡', type: 'base', cost: 1, desc: '使本次受到的伤害减少2（最少为0）' },
  { id: '超级无敌格挡', name: '超级无敌格挡', type: 'base', cost: 2, desc: '使本次受到的伤害减少3（最少为0）' },
  { id: '反转', name: '反转', type: 'base', cost: 2, desc: '对方的牌为你所用（若此牌需要消耗能量，则消耗对方的能量，若回复能量，则回复对方的能量）' }
];

export const SKILL_CARDS = [
  { id: '终焉一击', name: '终焉一击', type: 'skill_reusable', cost: 3, desc: '对对方造成4伤害' },
  { id: '无敌', name: '无敌', type: 'skill_reusable', cost: 2, desc: '将本次受到的伤害设置为0' },
  { id: '无懈可击', name: '无懈可击', type: 'skill_reusable', cost: 1, desc: '使对方牌的效果无效，若无特殊说明，则对方下回合不能使用该牌' },
  { id: '终·无懈可击', name: '终·无懈可击', type: 'skill_onetime', cost: 0, desc: '使对方牌的效果无效，若对方牌不为回能，则对方之后的回合都不能使用这张牌' },
  { id: '生命提升', name: '生命提升', type: 'skill_passive', cost: 0, desc: '初始生命，最大生命+1' },
  { id: '能量提升', name: '能量提升', type: 'skill_passive', cost: 0, desc: '初始能量，最大能量+1' },
  { id: '何意味', name: '何意味', type: 'skill_passive', cost: 0, desc: '技能牌选择完成时，将该牌转换为对方的技能牌' },
  { id: '绝地反击', name: '绝地反击', type: 'skill_passive', cost: 0, desc: '当自己生命首次小于等于0时进入特殊状态，下回合结算后死亡。' },
  { id: '不屈', name: '不屈', type: 'skill_onetime', cost: 0, desc: '对对方造成（最大生命值-当前生命值+1）的伤害' },
  { id: '反弹', name: '反弹', type: 'skill_onetime', cost: 0, desc: '若本次受到了伤害，则使本次受到的伤害减少3。若减少后受到的伤害小于0，则自己不受到伤害，并反弹对手对应的伤害' },
  { id: '决斗', name: '决斗', type: 'skill_onetime', cost: 0, desc: '本回合结束时将对方的生命设置为自己的生命，自己与对方至少保留1点生命' },
  { id: '生命回复', name: '生命回复', type: 'skill_onetime', cost: 0, desc: '出牌后回复1点生命，并在下一回合结束时也回复1点生命' },
  { id: '运', name: '运', type: 'skill_onetime', cost: 0, desc: '进行判定，执行随机效果：对对方造成2伤害(20)，对自己造成1伤害(20)，为对方回复1生命(20)，为自己回复2生命(20)，对对方造成999伤害(1)，对自己造成999伤害(1)，为对方回复999生命与能量(1)，为自己回复999生命与能量(1)，什么都不发生(20)' },
  { id: '明牌', name: '明牌', type: 'skill_onetime', cost: 0, desc: '使对方牌的效果无效（该效果拥有最高优先级），并使对方下一回合禁止出牌，改为结算上一回合无效的牌的效果' },
  { id: '持久战', name: '持久战', type: 'skill_passive', cost: 0, desc: '每5回合获得以下效果（回合结束时获得）：生命+1，能量+1' },
  { id: '闪击战', name: '闪击战', type: 'skill_passive', cost: 0, desc: '游戏开始时使对方生命+1，能量+1，自己生命+1，能量+2' },
  { id: 'xxs', name: 'xxs', type: 'skill_passive', cost: 0, desc: '自己生命上限-2，能量上限-1，自己生命首次小于等于0时将生命，能量恢复至上限' },
  { id: 'P话哥', name: 'P话哥', type: 'skill_passive', cost: 0, desc: '游戏开始时弃置自己和对方的技能牌' },
];

export const ALL_CARDS = [...BASE_CARDS, ...SKILL_CARDS];

export function getCardById(id) {
  return ALL_CARDS.find(c => c.id === id);
}
