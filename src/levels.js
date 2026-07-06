export function createLevels(GameModes) {
    // Note: Built-in levels use the old wall format (x, z, w, d) for definition,
    // but will be converted to the new format (p1, p2, t) upon loading.
    const nightEnvironment = {
      dayNightCycleEnabled: false,
      cycleDuration: 180,
      sunIntensityMultiplier: 0.18,
      defaultSkyColor: '#050816',
      daySkyColor: '#111827',
      nightSkyColor: '#050816',
      centralGemHeight: 50,
      centralGemIntensity: 0.12,
      centralGemColor: '#8fb8ff',
      lighthouseColor: '#ffd27a',
      lighthouseIntensity: 0.22,
      lighthouseTowerColor: '#777777',
      columnColor: '#d1d5db'
    };
    const withNight = (level) => ({
      ...level,
      environment: { ...nightEnvironment, ...(level.environment || {}) }
    });

    return {
      one: withNight({ name:"Training", gameMode: GameModes.ELIM, timer:60, arenaSize:{width:60,depth:50}, playerStart:{x:0, z:20}, turrets:[{kind:'turret', x:-10,z:-10, subType:'fixed',rate:2.0,bps:60},{kind:'turret', x:10,z:-10, subType:'fixed',rate:2.0,bps:60}]}),
      two: withNight({ name:"Moving Targets", gameMode: GameModes.ELIM, timer:90, arenaSize:{width:80,depth:60}, playerStart:{x:0, z:25}, turrets:[{kind:'turret', x:-20,z:-15,subType:'moving',gear:1,rate:2.0,bps:60},{kind:'turret', x:20,z:-15,subType:'moving',gear:1,rate:2.0,bps:60},{kind:'turret', x:0,z:-20,subType:'moving',gear:2,w:40,d:0,mode:'lr',rate:2.0,bps:60}]}),
      three: withNight({ name:"Survival Trial", gameMode: GameModes.SURV, timer:45, arenaSize:{width:70,depth:70}, playerStart:{x:0, z:0}, turrets:[{kind:'turret', x:-25,z:-25,rate:1.5,bps:60},{kind:'turret', x:25,z:-25,rate:1.5,bps:60},{kind:'turret', x:-25,z:25,rate:1.5,bps:60},{kind:'turret', x:25,z:25,rate:1.5,bps:60},{kind:'turret', x:0,z:-28,subType:'fixed',rate:1.5,bps:60},{kind:'turret', x:0,z:28,subType:'fixed',rate:1.5,bps:60}], walls:[{x:0,z:0,w:8,h:4,d:8}]}),
      four: withNight({ name:"Trackers", gameMode: GameModes.ELIM, timer:120, arenaSize:{width:90,depth:70}, playerStart:{x:0, z:30}, turrets:[{kind:'turret', x:-30, z:-15, subType:'tracking', gear:3, rate:1.0, w:10, d:10, mode:'area', bps:60}, {kind:'turret', x:30, z:-15, subType:'tracking', gear:3, rate:1.0, w:10, d:10, mode:'area', bps:60}]})
    };
}
