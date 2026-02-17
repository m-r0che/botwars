import * as THREE from 'three';
import { P1_COLOR, P2_COLOR, BOT_RADIUS } from '../utils/constants';
import { lerp } from '../utils/math';
import type { BotStyle, TerrainData } from '../engine/types';
import { DEFAULT_STYLE } from '../engine/types';
import { sampleTerrainHeight } from '../arena/ArenaGenerator';

interface MechMesh {
  group: THREE.Group;
  torso: THREE.Mesh;
  chestPlate: THREE.Mesh;
  energyCore: THREE.Mesh;
  head: THREE.Mesh;
  visor: THREE.Mesh;
  antenna: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  thruster: THREE.Mesh;
  shield: THREE.Mesh;
  color: number;
  walkPhase: number;
}

const MECH_METALNESS = 0.7;
const MECH_ROUGHNESS = 0.3;

export class BotRenderer {
  private bots: MechMesh[] = [];
  private scene: THREE.Scene;
  private terrain: TerrainData | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setTerrain(terrain: TerrainData | null) {
    this.terrain = terrain;
  }

  createBots(styles?: [BotStyle | null, BotStyle | null]) {
    this.clear();
    this.bots = [
      this.createMech(P1_COLOR, 0),
      this.createMech(P2_COLOR, 1),
    ];
  }

  private createMech(color: number, id: number): MechMesh {
    const group = new THREE.Group();
    const baseColor = new THREE.Color(color);
    const darkColor = baseColor.clone().multiplyScalar(0.4);
    const emissiveColor = baseColor.clone().multiplyScalar(0.8);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: darkColor,
      metalness: MECH_METALNESS,
      roughness: MECH_ROUGHNESS,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: MECH_METALNESS,
      roughness: MECH_ROUGHNESS,
      emissive: emissiveColor,
      emissiveIntensity: 0.2,
    });
    const emissiveMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: 0.8,
      metalness: 0.3,
      roughness: 0.4,
    });

    // --- Torso ---
    const torsoGeo = new THREE.BoxGeometry(1.0, 0.8, 0.6);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.6;
    torso.castShadow = true;
    group.add(torso);

    // Chest plate accent
    const chestGeo = new THREE.BoxGeometry(0.7, 0.4, 0.05);
    const chestPlate = new THREE.Mesh(chestGeo, accentMat);
    chestPlate.position.set(0, 1.65, 0.33);
    group.add(chestPlate);

    // Energy core (pulsing)
    const coreGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const energyCore = new THREE.Mesh(coreGeo, emissiveMat);
    energyCore.position.set(0, 1.6, 0.36);
    group.add(energyCore);

    // --- Head ---
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    headGeo.scale(1, 0.7, 1);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 2.2;
    head.castShadow = true;
    group.add(head);

    // Visor (emissive bar)
    const visorGeo = new THREE.BoxGeometry(0.35, 0.08, 0.1);
    const visor = new THREE.Mesh(visorGeo, emissiveMat);
    visor.position.set(0, 2.2, 0.2);
    group.add(visor);

    // Antenna
    const antennaGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4);
    const antenna = new THREE.Mesh(antennaGeo, accentMat);
    antenna.position.set(0.15, 2.42, 0);
    group.add(antenna);

    // --- Arms ---
    const leftArm = this.createArm(bodyMat, accentMat, -1);
    leftArm.position.set(-0.65, 1.7, 0);
    group.add(leftArm);

    const rightArm = this.createArm(bodyMat, accentMat, 1);
    rightArm.position.set(0.65, 1.7, 0);
    group.add(rightArm);

    // --- Legs ---
    const leftLeg = this.createLeg(bodyMat, accentMat);
    leftLeg.position.set(-0.25, 1.15, 0);
    group.add(leftLeg);

    const rightLeg = this.createLeg(bodyMat, accentMat);
    rightLeg.position.set(0.25, 1.15, 0);
    group.add(rightLeg);

    // --- Thruster (back-mounted) ---
    const thrusterGeo = new THREE.ConeGeometry(0.15, 0.3, 6);
    const thruster = new THREE.Mesh(thrusterGeo, emissiveMat);
    thruster.position.set(0, 1.4, -0.4);
    thruster.rotation.x = Math.PI;
    group.add(thruster);

    // --- Shield (invisible by default) ---
    const shieldGeo = new THREE.SphereGeometry(1.3, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00fff5,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 1.5;
    group.add(shield);

    this.scene.add(group);

    return {
      group, torso, chestPlate, energyCore, head, visor, antenna,
      leftArm, rightArm, leftLeg, rightLeg, thruster, shield,
      color, walkPhase: id * Math.PI,
    };
  }

  private createArm(bodyMat: THREE.Material, accentMat: THREE.Material, side: number): THREE.Group {
    const arm = new THREE.Group();

    // Shoulder sphere
    const shoulderGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const shoulder = new THREE.Mesh(shoulderGeo, accentMat);
    arm.add(shoulder);

    // Upper arm cylinder
    const upperGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.35, 6);
    const upper = new THREE.Mesh(upperGeo, bodyMat);
    upper.position.y = -0.22;
    arm.add(upper);

    // Forearm box
    const forearmGeo = new THREE.BoxGeometry(0.14, 0.3, 0.12);
    const forearm = new THREE.Mesh(forearmGeo, accentMat);
    forearm.position.y = -0.52;
    arm.add(forearm);

    return arm;
  }

  private createLeg(bodyMat: THREE.Material, accentMat: THREE.Material): THREE.Group {
    const leg = new THREE.Group();

    // Hip sphere
    const hipGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const hip = new THREE.Mesh(hipGeo, accentMat);
    leg.add(hip);

    // Thigh cylinder
    const thighGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.35, 6);
    const thigh = new THREE.Mesh(thighGeo, bodyMat);
    thigh.position.y = -0.22;
    leg.add(thigh);

    // Shin cylinder
    const shinGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.35, 6);
    const shin = new THREE.Mesh(shinGeo, bodyMat);
    shin.position.y = -0.55;
    leg.add(shin);

    // Foot box
    const footGeo = new THREE.BoxGeometry(0.14, 0.06, 0.2);
    const foot = new THREE.Mesh(footGeo, accentMat);
    foot.position.set(0, -0.75, 0.04);
    leg.add(foot);

    return leg;
  }

  update(
    botStates: Array<{
      position: { x: number; y: number };
      facing: { x: number; y: number };
      isDefending: boolean;
      status: { burning: number; shielded: boolean };
    }>,
    prevPositions: Array<{ x: number; y: number }>,
    currPositions: Array<{ x: number; y: number }>,
    alpha: number,
    time: number,
  ) {
    for (let i = 0; i < this.bots.length; i++) {
      const mech = this.bots[i];
      const state = botStates[i];
      if (!mech || !state) continue;

      // Interpolated position
      const interpX = lerp(prevPositions[i].x, currPositions[i].x, alpha);
      const interpY = lerp(prevPositions[i].y, currPositions[i].y, alpha);

      mech.group.position.x = interpX;
      mech.group.position.z = interpY;

      // Terrain Y offset
      if (this.terrain) {
        mech.group.position.y = sampleTerrainHeight(this.terrain, interpX, interpY);
      }

      // Face toward facing direction
      const faceAngle = Math.atan2(state.facing.x, state.facing.y);
      mech.group.rotation.y = faceAngle;

      // Movement detection for walk cycle
      const dx = currPositions[i].x - prevPositions[i].x;
      const dy = currPositions[i].y - prevPositions[i].y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const isMoving = speed > 0.01;

      if (isMoving) {
        mech.walkPhase += 0.2;
      }

      // Walk animation
      const walkAmp = isMoving ? 0.3 : 0;
      const walkSin = Math.sin(mech.walkPhase * 6);
      const walkCos = Math.cos(mech.walkPhase * 6);

      // Leg animation
      mech.leftLeg.rotation.x = walkSin * walkAmp;
      mech.rightLeg.rotation.x = -walkSin * walkAmp;

      // Arm sway (opposite to legs)
      mech.leftArm.rotation.x = -walkSin * walkAmp * 0.6;
      mech.rightArm.rotation.x = walkSin * walkAmp * 0.6;

      // Idle bob
      const idleBob = Math.sin(time * 2 + i * Math.PI) * 0.03;
      mech.torso.position.y = 1.6 + idleBob;
      mech.head.position.y = 2.2 + idleBob;

      // Head tracking — look toward enemy
      const enemyIdx = 1 - i;
      const enemyState = botStates[enemyIdx];
      if (enemyState) {
        const enemyWorldX = lerp(prevPositions[enemyIdx].x, currPositions[enemyIdx].x, alpha);
        const enemyWorldZ = lerp(prevPositions[enemyIdx].y, currPositions[enemyIdx].y, alpha);
        const toEnemyX = enemyWorldX - mech.group.position.x;
        const toEnemyZ = enemyWorldZ - mech.group.position.z;
        const headAngle = Math.atan2(toEnemyX, toEnemyZ) - faceAngle;
        mech.head.rotation.y = Math.max(-0.5, Math.min(0.5, headAngle));
      }

      // Energy core pulse
      const coreScale = 1.0 + Math.sin(time * 6 + i) * 0.3;
      mech.energyCore.scale.setScalar(coreScale);
      const coreMat = mech.energyCore.material as THREE.MeshStandardMaterial;
      coreMat.emissiveIntensity = 0.5 + Math.sin(time * 8 + i) * 0.3;

      // Thruster glow
      const thrusterMat = mech.thruster.material as THREE.MeshStandardMaterial;
      thrusterMat.emissiveIntensity = isMoving ? (0.8 + Math.sin(time * 15) * 0.2) : 0.2;
      mech.thruster.scale.y = isMoving ? (1.0 + Math.sin(time * 20) * 0.3) : 0.5;

      // Shield visibility
      const shieldMat = mech.shield.material as THREE.MeshBasicMaterial;
      if (state.isDefending) {
        shieldMat.opacity = 0.15 + Math.sin(time * 10) * 0.05;
        mech.shield.rotation.y = time * 2;
      } else {
        shieldMat.opacity = 0;
      }

      // Burning effect
      const torsoMat = mech.torso.material as THREE.MeshStandardMaterial;
      if (state.status.burning > 0) {
        const burnFlash = Math.sin(time * 15) * 0.3 + 0.7;
        torsoMat.emissive = new THREE.Color(0xff4400);
        torsoMat.emissiveIntensity = burnFlash * 0.5;
      } else {
        torsoMat.emissive = new THREE.Color(0x000000);
        torsoMat.emissiveIntensity = 0;
      }
    }
  }

  flashHit(botId: number) {
    const mech = this.bots[botId];
    if (!mech) return;
    const mat = mech.torso.material as THREE.MeshStandardMaterial;
    const origColor = mat.color.clone();
    mat.color.set(0xffffff);
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 1.0;
    setTimeout(() => {
      mat.color.copy(origColor);
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
    }, 80);
  }

  flashHeal(botId: number) {
    const mech = this.bots[botId];
    if (!mech) return;
    const mat = mech.torso.material as THREE.MeshStandardMaterial;
    const origEmissive = mat.emissive.clone();
    mat.emissive = new THREE.Color(0x44ff44);
    mat.emissiveIntensity = 1.0;
    setTimeout(() => {
      mat.emissive.copy(origEmissive);
      mat.emissiveIntensity = 0;
    }, 200);
  }

  flashDash(botId: number) {
    const mech = this.bots[botId];
    if (!mech) return;
    const thrusterMat = mech.thruster.material as THREE.MeshStandardMaterial;
    const coreMat = mech.energyCore.material as THREE.MeshStandardMaterial;
    thrusterMat.emissiveIntensity = 2.0;
    coreMat.emissiveIntensity = 2.0;
    mech.thruster.scale.y = 2.5;
    setTimeout(() => {
      thrusterMat.emissiveIntensity = 0.2;
      coreMat.emissiveIntensity = 0.5;
      mech.thruster.scale.y = 1.0;
    }, 150);
  }

  clear() {
    for (const mech of this.bots) {
      this.scene.remove(mech.group);
      mech.group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
    this.bots = [];
  }
}
