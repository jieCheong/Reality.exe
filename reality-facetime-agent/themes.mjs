/** Final visual worlds from Juan's pinned renderer, not placeholder content. */
import { THEMES as JUAN_THEMES } from './juan-hud/face.mjs';
export const THEMES = Object.freeze(Object.entries(JUAN_THEMES).map(([id,theme])=>Object.freeze({
  id,name:theme.name,aliases:Object.freeze([id,theme.shortName.toLowerCase()]),intro:theme.description,
  description:theme.description,missionIntros:Object.freeze({}),
})));
