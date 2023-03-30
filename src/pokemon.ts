import Phaser from 'phaser';
import BattleScene from './battle-scene';
import BattleInfo, { PlayerBattleInfo, EnemyBattleInfo } from './battle-info';
import { MessagePhase } from './battle-phase';
import { default as Move, allMoves, MOVE_CATEGORY as MoveCategory, Moves } from './move';
import { pokemonLevelMoves } from './pokemon-level-moves';
import { default as PokemonSpecies } from './pokemon-species';
import * as Utils from './utils';
import { getTypeDamageMultiplier } from './type';
import { getLevelTotalExp } from './exp';
import { Stat } from './pokemon-stat';
import { PokemonBaseStatModifier as PokemonBaseStatBoosterModifier, ShinyRateBoosterModifier } from './modifier';
import { PokeballType } from './pokeball';

export default abstract class Pokemon extends Phaser.GameObjects.Container {
  public id: integer;
  public name: string;
  public species: PokemonSpecies;
  public shiny: boolean;
  public pokeball: PokeballType;
  protected battleInfo: BattleInfo;
  public level: integer;
  public exp: integer;
  public levelExp: integer;
  public gender: integer;
  public hp: integer;
  public stats: integer[];
  public ivs: integer[];
  public moveset: PokemonMove[];
  public winCount: integer;

  private shinySparkle: Phaser.GameObjects.Sprite;

  constructor(scene: BattleScene, x: number, y: number, species: PokemonSpecies, level: integer, dataSource?: Pokemon) {
    super(scene, x, y);
    this.name = Utils.toPokemonUpperCase(species.name);
    this.species = species;
    this.battleInfo = this.isPlayer()
      ? new PlayerBattleInfo(scene)
      : new EnemyBattleInfo(scene);
    this.pokeball = dataSource?.pokeball || PokeballType.POKEBALL;
    this.level = level;//Utils.randInt(player ? 100 : 30, player ? 41 : 1);
    this.exp = dataSource?.exp || getLevelTotalExp(this.level, species.growthRate);
    this.levelExp = dataSource?.levelExp || 0;
    if (dataSource) {
      this.id = dataSource.id;
      this.shiny = dataSource.shiny;
      this.gender = dataSource.gender;
      this.hp = dataSource.hp;
      this.stats = dataSource.stats;
      this.ivs = dataSource.ivs;
      this.moveset = dataSource.moveset;
      this.winCount = dataSource.winCount;
    } else {
      this.generateAndPopulateMoveset();

      this.id = Utils.randInt(4294967295);
      this.ivs = [
        Utils.binToDec(Utils.decToBin(this.id).substring(0, 5)),
        Utils.binToDec(Utils.decToBin(this.id).substring(5, 10)),
        Utils.binToDec(Utils.decToBin(this.id).substring(10, 15)),
        Utils.binToDec(Utils.decToBin(this.id).substring(15, 20)),
        Utils.binToDec(Utils.decToBin(this.id).substring(20, 25)),
        Utils.binToDec(Utils.decToBin(this.id).substring(25, 30))
      ];
    //} else
    //this.id = parseInt(Utils.decToBin(this.ivs[Stat.HP]) + Utils.decToBin(this.ivs[Stat.ATK]) + Utils.decToBin(this.ivs[Stat.DEF]) + Utils.decToBin(this.ivs[Stat.SPATK]) + Utils.decToBin(this.ivs[Stat.SPDEF]) + Utils.decToBin(this.ivs[Stat.SPD]) + this.id.toString(2).slice(30));
    
      if (this.species.malePercent === null)
        this.gender = -1;
      else {
        const genderChance = (this.id % 256) / 32;
        if (genderChance < this.species.malePercent)
          this.gender = 0;
        else
          this.gender = 1;
      }

      const rand1 = Utils.binToDec(Utils.decToBin(this.id).substring(0, 16));
      const rand2 = Utils.binToDec(Utils.decToBin(this.id).substring(16, 32));

      const E = (this.scene as BattleScene).trainerId ^ (this.scene as BattleScene).secretId;
      const F = rand1 ^ rand2;

      let shinyThreshold = new Utils.IntegerHolder(32);
      (this.scene as BattleScene).applyModifiers(ShinyRateBoosterModifier, shinyThreshold);
      console.log(shinyThreshold.value);

      this.shiny = (E ^ F) < shinyThreshold.value;
      if ((E ^ F) < 32)
        console.log('REAL SHINY!!');
      if (this.shiny)
        console.log((E ^ F), shinyThreshold.value);
      /*else
        this.shiny = Utils.randInt(16) === 0;*/

      this.winCount = 0;
    }

    this.calculateStats();

    (scene as BattleScene).fieldUI.add(this.battleInfo);
    
    this.battleInfo.initInfo(this);

    const getSprite = () => {
      const ret = this.scene.add.sprite(0, 0, `pkmn__${this.isPlayer() ? 'back__' : ''}sub`);
      ret.setOrigin(0.5, 1);
      return ret;
    };
    
    const sprite = getSprite();
    const tintSprite = getSprite();

    tintSprite.setVisible(false);

    this.add(sprite);
    this.add(tintSprite);

    if (this.shiny) {
      const shinySparkle = this.scene.add.sprite(0, 0, 'shiny');
      shinySparkle.setVisible(false);
      shinySparkle.setOrigin(0.5, 1);
      const frameNames = this.scene.anims.generateFrameNames('shiny', { suffix: '.png', end: 34 });
      this.scene.anims.create({
        key: 'sparkle',
        frames: frameNames,
        frameRate: 32,
        showOnStart: true,
        hideOnComplete: true,
      });
      this.add(shinySparkle);

      this.shinySparkle = shinySparkle;
    }
  }

  abstract isPlayer(): boolean;

  loadAssets(): Promise<void> {
    return new Promise(resolve => {
      (this.scene as BattleScene).loadAtlas(this.getSpriteKey(), 'pokemon', this.getAtlasPath());
      this.scene.load.audio(this.species.speciesId.toString(), `audio/cry/${this.species.speciesId}.mp3`);
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        const originalWarn = console.warn;
        // Ignore warnings for missing frames, because there will be a lot
        console.warn = () => {};
        const frameNames = this.scene.anims.generateFrameNames(this.getSpriteKey(), { zeroPad: 4, suffix: ".png", start: 1, end: 256 });
        console.warn = originalWarn;
        this.scene.anims.create({
          key: this.getSpriteKey(),
          frames: frameNames,
          frameRate: 12,
          repeat: -1
        });
        this.getSprite().play(this.getSpriteKey());
        this.getTintSprite().play(this.getSpriteKey());
        resolve();
      });
    });
  }

  getAtlasPath(): string {
    return this.getSpriteId().replace(/\_{2}/g, '/');
  }

  getSpriteId(): string {
    return `${this.isPlayer() ? 'back__' : ''}${this.shiny ? 'shiny__' : ''}${this.species.genderDiffs && !this.gender ? 'female__' : ''}${this.species.speciesId}`;
  }

  getSpriteKey(): string {
    return `pkmn__${this.getSpriteId()}`;
  }

  getIconAtlasKey(): string {
    return `pokemon_icons_${this.species.generation}`;
  }

  getIconId(): string {
    return `${Utils.padInt(this.species.speciesId, 3)}`;
  }

  getIconKey(): string {
    return `pkmn_icon__${this.getIconId()}`;
  }

  getSprite(): Phaser.GameObjects.Sprite {
    return this.getAt(0) as Phaser.GameObjects.Sprite;
  }

  getTintSprite(): Phaser.GameObjects.Sprite {
    return this.getAt(1) as Phaser.GameObjects.Sprite;
  }

  calculateStats() {
    if (!this.stats)
      this.stats = [ 0, 0, 0, 0, 0, 0 ];
    const baseStats = this.species.baseStats.slice(0);
    console.log(this.id);
    (this.scene as BattleScene).applyModifiers(PokemonBaseStatBoosterModifier, this.id, baseStats);
    const stats = Utils.getEnumValues(Stat);
    for (let s of stats) {
      const isHp = s === Stat.HP;
      let baseStat = baseStats[s];
      let value = Math.floor(((2 * baseStat + this.ivs[s] + (0 / 4)) * this.level) * 0.01);
      if (isHp) {
        value = Math.min(value + this.level + 10, 99999);
        if (this.hp > value || this.hp === undefined)
          this.hp = value;
        else {
          const lastMaxHp = this.getMaxHp();
          if (lastMaxHp && value > lastMaxHp)
            this.hp += value - lastMaxHp;
        }
      } else
        value = Math.min(value + 5, 99999);
      this.stats[s] = value;
    }
  }

  getMaxHp() {
    return this.stats[Stat.HP];
  }

  getHpRatio() {
    return Math.floor((this.hp / this.getMaxHp()) * 100) / 100;
  }

  generateAndPopulateMoveset() {
    this.moveset = [];
    const movePool = [];
    const allLevelMoves = pokemonLevelMoves[this.species.speciesId];
    if (!allLevelMoves) {
      console.log(this.species.speciesId, 'ERROR')
      return;
    }
    for (let m = 0; m < allLevelMoves.length; m++) {
      const levelMove = allLevelMoves[m];
      if (this.level < levelMove[0])
        break;
      if (movePool.indexOf(levelMove[1]) === -1)
        movePool.push(levelMove[1]);
    }

    const attackMovePool = movePool.filter(m => {
      const move = allMoves[m - 1];
      return move.category !== MoveCategory.STATUS;
    });

    if (attackMovePool.length) {
      const moveIndex = Utils.randInt(attackMovePool.length);
      this.moveset.push(new PokemonMove(attackMovePool[moveIndex], 0, 0));
      console.log(allMoves[attackMovePool[moveIndex] - 1]);
      movePool.splice(movePool.findIndex(m => m === attackMovePool[moveIndex]), 1);
    }

    while (movePool.length && this.moveset.length < 4) {
      const moveIndex = Utils.randInt(movePool.length);
      this.moveset.push(new PokemonMove(movePool[moveIndex], 0, 0));
      console.log(allMoves[movePool[moveIndex] - 1]);
      movePool.splice(moveIndex, 1);
    }
  }

  trySelectMove(moveIndex: integer): boolean {
    const move = this.moveset.length > moveIndex
      ? this.moveset[moveIndex]
      : null;
    return move?.isUsable();
  }

  showInfo() {
    if (!this.battleInfo.visible) {
      this.battleInfo.setX(this.battleInfo.x + (this.isPlayer() ? 150 : -150));
      this.battleInfo.setVisible(true);
      this.scene.tweens.add({
        targets: this.battleInfo,
        x: this.isPlayer() ? '-=150' : '+=150',
        duration: 1000,
        ease: 'Sine.easeOut'
      });
    }
  }

  hideInfo() {
    if (this.battleInfo.visible) {
      this.scene.tweens.add({
        targets: this.battleInfo,
        x: this.isPlayer() ? '+=150' : '-=150',
        duration: 500,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.battleInfo.setVisible(false);
          this.battleInfo.setX(this.battleInfo.x - (this.isPlayer() ? 150 : -150));
        }
      });
    }
  }

  updateInfo(callback?: Function) {
    this.battleInfo.updateInfo(this, callback);
  }

  addExp(exp: integer) {
    this.exp += exp;
    while (this.exp >= getLevelTotalExp(this.level + 1, this.species.growthRate))
      this.level++;
    this.levelExp = this.exp - getLevelTotalExp(this.level, this.species.growthRate);
  }

  apply(source: Pokemon, battlerMove: PokemonMove, callback?: Function) {
    const battleScene = this.scene as BattleScene;
    let result: integer;
    let success = false;
    const move = battlerMove.getMove();
    const moveCategory = move.category;
    let damage = 0;
    switch (moveCategory) {
      case MoveCategory.PHYSICAL:
      case MoveCategory.SPECIAL:
        const isPhysical = moveCategory === MoveCategory.PHYSICAL;
        const isCritical = Utils.randInt(4) === 0;
        const sourceAtk = source.stats[isPhysical ? Stat.ATK : Stat.SPATK];
        const targetDef = this.stats[isPhysical ? Stat.DEF : Stat.SPDEF];
        const stabMultiplier = source.species.type1 === move.type || (source.species.type2 > -1 && source.species.type2 === move.type) ? 1.5 : 1;
        const typeMultiplier = getTypeDamageMultiplier(move.type, this.species.type1) * (this.species.type2 > -1 ? getTypeDamageMultiplier(move.type, this.species.type2) : 1);
        const criticalMultiplier = isCritical ? 2 : 1;
        damage = Math.ceil(((((2 * source.level / 5 + 2) * move.power * sourceAtk / targetDef) / 50) + 2) * stabMultiplier * typeMultiplier * ((Utils.randInt(15) + 85) / 100)) * criticalMultiplier;
        console.log('damage', damage, move.name, move.power, sourceAtk, targetDef);
        if (damage) {
          this.hp = Math.max(this.hp - damage, 0);
          if (isCritical)
            battleScene.unshiftPhase(new MessagePhase(battleScene, 'A critical hit!'));
        }
        if (typeMultiplier >= 2)
          result = MoveResult.SUPER_EFFECTIVE;
        else if (typeMultiplier >= 1)
          result = MoveResult.EFFECTIVE;
        else if (typeMultiplier > 0)
          result = MoveResult.NOT_VERY_EFFECTIVE;
        else
          result = MoveResult.NO_EFFECT;

        switch (result) {
          case MoveResult.EFFECTIVE:
            this.scene.sound.play('hit');
            success = true;
            break;
          case MoveResult.SUPER_EFFECTIVE:
            this.scene.sound.play('hit_strong');
            battleScene.unshiftPhase(new MessagePhase(battleScene, 'It\'s super effective!'));
            success = true;
            break;
          case MoveResult.NOT_VERY_EFFECTIVE:
            this.scene.sound.play('hit_weak');
            battleScene.unshiftPhase(new MessagePhase(battleScene, 'It\'s not very effective!'))
            success = true;
            break;
          case MoveResult.NO_EFFECT:
            battleScene.unshiftPhase(new MessagePhase(battleScene, `It doesn\'t affect ${this.name}!`))
            success = true;
            break;
          case MoveCategory.STATUS:
            result = MoveResult.OTHER;
            success = true;
            break;
        }
    }

    if (success) {
      if (result <= MoveResult.NOT_VERY_EFFECTIVE) {
        const flashTimer = this.scene.time.addEvent({
          delay: 100,
          repeat: 5,
          startAt: 200,
          callback: () => {
            this.getSprite().setVisible(flashTimer.repeatCount % 2 === 0);
            if (!flashTimer.repeatCount) {
              this.battleInfo.updateInfo(this, () => {
                if (callback)
                  callback();
              });
            }
          }
        });
      } else {
        this.battleInfo.updateInfo(this, () => {
          if (callback)
            callback();
        });
      }
    } else
      callback();
  }

  cry() {
    this.scene.sound.play(this.species.speciesId.toString());
  }

  faintCry(callback: Function) {
    const key = this.species.speciesId.toString();
    let i = 0;
    let rate = 0.85;
    this.scene.sound.play(key, {
      rate: rate
    });
    const sprite = this.getSprite();
    const delay = Math.max(this.scene.sound.get(key).totalDuration * 50, 25);
    let frameProgress = 0;
    let frameThreshold: number;
    sprite.anims.pause();
    let faintCryTimer = this.scene.time.addEvent({
      delay: delay,
      repeat: -1,
      callback: () => {
        ++i;
        frameThreshold = sprite.anims.msPerFrame / rate;
        frameProgress += delay;
        while (frameProgress > frameThreshold) {
          if (sprite.anims.duration)
            sprite.anims.nextFrame();
          frameProgress -= frameThreshold;
        }
        const crySound = this.scene.sound.get(key);
        if (crySound) {
          rate *= 0.99;
          crySound.play({
            rate: rate,
            seek: (i * delay * 0.001) * rate
          });
        }
        else {
          faintCryTimer.destroy();
          faintCryTimer = null;
          if (callback)
            callback();
        }
      }
    });
    // Failsafe
    this.scene.time.delayedCall(5000, () => {
      if (!faintCryTimer || !this.scene)
        return;
      const crySound = this.scene.sound.get(key);
      if (crySound?.isPlaying)
        crySound.stop();
      faintCryTimer.destroy();
      if (callback)
        callback();
    });
  }

  getExpValue(victorLevel: integer): integer {
    // Gen 1-4 formula
    // return ((this.pokemon.baseExp * this.level) / 7) * (1 / 1)
    // TODO: Update for exp share
    return Math.floor(((this.species.baseExp * this.level) / 5) * (1 / 1) * ((Math.round(Math.sqrt(2 * this.level + 10)) * Math.pow(2 * this.level + 10, 2)) / (Math.round(Math.sqrt(this.level + victorLevel + 10)) * Math.pow(this.level + victorLevel + 10, 2)))) + 1;
  }

  tint(color: number, alpha?: number, duration?: integer, ease?: string) {
    const tintSprite = this.getTintSprite();
    tintSprite.setTintFill(color);
    tintSprite.setVisible(true);

    if (duration) {
      tintSprite.setAlpha(0);

      this.scene.tweens.add({
        targets: tintSprite,
        alpha: alpha || 1,
        duration: duration,
        ease: ease || 'Linear'
      });
    } else
      tintSprite.setAlpha(alpha);
  }

  untint(duration: integer, ease?: string) {
    const tintSprite = this.getTintSprite();

    if (duration) {
      this.scene.tweens.add({
        targets: tintSprite,
        alpha: 0,
        duration: duration,
        ease: ease || 'Linear',
        onComplete: () => tintSprite.setVisible(false)
      });
    } else
      tintSprite.setVisible(false);
  }

  sparkle(): void {
    if (this.shinySparkle) {
      this.shinySparkle.play('sparkle');
      this.scene.sound.play('shiny');
    }
  }
}

export class PlayerPokemon extends Pokemon {
  constructor(scene: BattleScene, species: PokemonSpecies, level: integer, dataSource?: Pokemon) {
    super(scene, 106, 148, species, level, dataSource);

    this.generateIconAnim();
  }

  isPlayer() {
    return true;
  }

  generateIconAnim() {
    const frameNames = this.scene.anims.generateFrameNames(this.getIconAtlasKey(), { prefix: `${this.getIconId()}_`, zeroPad: 2, suffix: '.png', start: 1, end: 34 });
    this.scene.anims.create({
      key: this.getIconKey(),
      frames: frameNames,
      frameRate: 128,
      repeat: -1
    });
  }
}

export class EnemyPokemon extends Pokemon {
  public aiType: AiType;

  constructor(scene: BattleScene, species: PokemonSpecies, level: integer) {
    super(scene, -63, 86, species, level);

    this.aiType = AiType.SMART_RANDOM;
  }

  getNextMove(): PokemonMove {
    const movePool = this.moveset.filter(m => m.isUsable());
    if (movePool.length) {
      if (movePool.length === 1)
        return movePool[0];
      switch (this.aiType) {
        case AiType.RANDOM:
          return movePool[Utils.randInt(movePool.length)];
        case AiType.SMART_RANDOM:
        case AiType.SMART:
          const target = (this.scene as BattleScene).getPlayerPokemon();
          const moveScores = movePool.map(() => 0);
          for (let m in movePool) {
            const pokemonMove = movePool[m];
            const move = pokemonMove.getMove();
            let score = moveScores[m];
            if (move.category === MoveCategory.STATUS) {
              score++;
            } else {
              const effectiveness = getTypeDamageMultiplier(move.type, target.species.type1) * (target.species.type2 > -1 ? getTypeDamageMultiplier(move.type, target.species.type2) : 1);
              let score = Math.pow(effectiveness - 1, 2) * effectiveness < 1 ? -2 : 2;
              if (score) {
                if (move.category === MoveCategory.PHYSICAL) {
                  if (this.stats[Stat.ATK] > this.stats[Stat.SPATK]) {
                    const statRatio = this.stats[Stat.SPATK] / this.stats[Stat.ATK];
                    if (statRatio <= 0.75)
                      score *= 2;
                    else if (statRatio <= 0.875)
                      score *= 1.5;
                  }
                } else {
                  if (this.stats[Stat.SPATK] > this.stats[Stat.ATK]) {
                    const statRatio = this.stats[Stat.ATK] / this.stats[Stat.SPATK];
                    if (statRatio <= 0.75)
                      score *= 2;
                    else if (statRatio <= 0.875)
                      score *= 1.5;
                  }
                }

                score += Math.floor(move.power / 5);
              }
              // could make smarter by checking opponent def/spdef
              moveScores[m] = score;
            }
          }

          console.log(moveScores);

          const sortedMovePool = movePool.slice(0);
          sortedMovePool.sort((a, b) => {
            const scoreA = moveScores[movePool.indexOf(a)];
            const scoreB = moveScores[movePool.indexOf(b)];
            return scoreA < scoreB ? 1 : scoreA > scoreB ? -1 : 0;
          });
          let randInt: integer;
          let r = 0;
          if (this.aiType === AiType.SMART_RANDOM) {
            while (r < sortedMovePool.length - 1 && (randInt = Utils.randInt(8)) >= 5)
              r++;
          }
          console.log(movePool.map(m => m.getName()), moveScores, r, sortedMovePool.map(m => m.getName()));
          return sortedMovePool[r];
      }
    }
    return new PokemonMove(Moves.STRUGGLE, 0, 0);
  }

  isPlayer() {
    return false;
  }

  addToParty() {
    const party = (this.scene as BattleScene).getParty();

    if (party.length < 6)
      party.push(new PlayerPokemon(this.scene as BattleScene, this.species, this.level, this));
    this.hp = 0;
  }
}

export enum AiType {
  RANDOM,
  SMART_RANDOM,
  SMART
};

export enum MoveResult {
  EFFECTIVE,
  SUPER_EFFECTIVE,
  NOT_VERY_EFFECTIVE,
  NO_EFFECT,
  OTHER
};

export class PokemonMove {
  public moveId: integer;
  public ppUsed: integer;
  public ppUp: integer;
  public disableTurns: integer;

  constructor(moveId: integer, ppUsed: integer, ppUp: integer) {
    this.moveId = moveId;
    this.ppUsed = ppUsed;
    this.ppUp = ppUp;
    this.disableTurns = 0;
  }

  isUsable(): boolean {
    if (this.disableTurns > 0)
      return false;
    return this.ppUsed < this.getMove().pp + this.ppUp;
  }

  getMove(): Move {
    return allMoves[this.moveId - 1];
  }

  getName(): string {
    return this.getMove().name.toUpperCase();
  }
}