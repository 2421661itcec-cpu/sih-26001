export const DEFAULT_RISK_INPUTS = {
  location: "Sikkim",
  rainfall: 120,
  slope: 35,
  soilMoisture: 65,
  soilStability: 50,
};

export const NER_LOCATIONS = [
  "Sikkim",
  "Arunachal Pradesh",
  "Assam",
  "Meghalaya",
  "Manipur",
  "Mizoram",
  "Nagaland",
  "Tripura",
];

export const RISK_LEVELS = {
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const RISK_INPUT_LIMITS = {
  rainfall: {
    min: 0,
    max: 300,
    unit: "mm",
  },

  slope: {
    min: 0,
    max: 60,
    unit: "degrees",
  },

  soilMoisture: {
    min: 0,
    max: 100,
    unit: "%",
  },

  soilStability: {
    min: 0,
    max: 100,
    unit: "%",
  },
};

export const createRiskInput = (overrides = {}) => ({
  ...DEFAULT_RISK_INPUTS,
  ...overrides,
});