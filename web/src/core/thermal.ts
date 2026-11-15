// Thermal proxy (contract §7.14) — screening only. No conduction, no terrain infrared, no internal dissipation.
import { SIGMA_SB } from './constants'

/** Radiative-equilibrium temperature (K) of an isolated plate facing the Sun: [α S f cos i / (ε σ)]^(1/4). */
export function plateEquilibriumK(absorptivity: number, emissivity: number, irradiance: number, visibleFraction: number, cosIncidence = 1): number | null {
  const q = absorptivity * irradiance * visibleFraction * Math.max(0, cosIncidence)
  if (q <= 0) return null // in shadow: radiating to deep space, heaters required (no invented night temperature)
  return Math.pow(q / (emissivity * SIGMA_SB), 0.25)
}

/** Survival-heater energy over the longest cold soak: E = P_heater · T_dark (Wh). */
export function heaterEnergyWh(heaterW: number, darkHours: number): number {
  return heaterW * darkHours
}

export const DEFAULT_THERMAL = { absorptivity: 0.9, emissivity: 0.85, heaterW: 20 } // assumptions, labelled in the UI
