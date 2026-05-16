/**
 * useFaceApi — Legacy re-export shim
 *
 * All logic has moved to useFaceEngine.ts.
 * This file is kept so existing imports continue to work without changes.
 */
export {
  useFaceEngine as useFaceApi,
  useFaceEngine,
  buildFaceMatcher,
  eyeAspectRatio,
  textureLivenessScore,
  type DetectionResult,
} from './useFaceEngine';