/*
 * SIH 26001
 * Temporal Risk Intelligence Engine
 *
 * Day 6
 *
 * Purpose:
 * Compares the current landslide risk prediction with
 * previous observations for the same region.
 *
 * This is a prototype temporal intelligence layer.
 * It uses in-memory observations and does not claim to
 * represent validated real-world historical sensor data.
 */

const MAX_HISTORY_PER_REGION = 20;

const observationHistory = new Map();

/*
 * Safely convert a value to a number.
 */
const toNumber = (value) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
};

/*
 * Keep risk scores inside the expected 0-100 range.
 */
const clampRiskScore = (score) => {
  return Math.max(
    0,
    Math.min(100, Number(score))
  );
};

/*
 * Round a number to two decimal places.
 */
const round = (value) => {
  return Math.round(value * 100) / 100;
};

/*
 * Store an observation for a region.
 */
const recordObservation = (
  location,
  riskScore,
  environmentalInputs = {}
) => {
  if (!location) {
    throw new Error(
      "Location is required to record a risk observation."
    );
  }

  const numericRiskScore =
    toNumber(riskScore);

  if (
    numericRiskScore === null ||
    numericRiskScore < 0 ||
    numericRiskScore > 100
  ) {
    throw new Error(
      "Risk score must be a number between 0 and 100."
    );
  }

  const observation = {
    timestamp: new Date().toISOString(),

    riskScore:
      clampRiskScore(numericRiskScore),

    environmentalInputs: {
      rainfall:
        toNumber(environmentalInputs.rainfall),

      slope:
        toNumber(environmentalInputs.slope),

      soilMoisture:
        toNumber(
          environmentalInputs.soilMoisture
        ),

      soilStability:
        toNumber(
          environmentalInputs.soilStability
        ),
    },
  };

  if (!observationHistory.has(location)) {
    observationHistory.set(location, []);
  }

  const history =
    observationHistory.get(location);

  history.push(observation);

  /*
   * Keep only the latest observations.
   */
  if (
    history.length >
    MAX_HISTORY_PER_REGION
  ) {
    history.splice(
      0,
      history.length -
        MAX_HISTORY_PER_REGION
    );
  }

  return observation;
};

/*
 * Get the latest existing observation for a region.
 *
 * IMPORTANT:
 * This function is called BEFORE the current observation
 * is recorded. Therefore, the latest existing observation
 * is the correct previous observation.
 */
const getPreviousObservation = (
  location
) => {
  const history =
    observationHistory.get(location) || [];

  if (history.length === 0) {
    return null;
  }

  return history[history.length - 1];
};

/*
 * Get complete observation history.
 */
const getObservationHistory = (
  location
) => {
  return [
    ...(observationHistory.get(location) || []),
  ];
};

/*
 * Determine the direction of risk movement.
 */
const getTrend = (riskChange) => {
  if (riskChange >= 5) {
    return {
      status: "Worsening",
      direction: "up",
      explanation:
        "Risk has increased significantly compared with the previous observation.",
    };
  }

  if (riskChange <= -5) {
    return {
      status: "Improving",
      direction: "down",
      explanation:
        "Risk has decreased significantly compared with the previous observation.",
    };
  }

  return {
    status: "Stable",
    direction: "stable",
    explanation:
      "Risk remains broadly stable compared with the previous observation.",
  };
};

/*
 * Determine escalation severity.
 */
const getEscalation = (riskChange) => {
  const absoluteChange =
    Math.abs(riskChange);

  if (absoluteChange >= 20) {
    return "Severe";
  }

  if (absoluteChange >= 10) {
    return "Significant";
  }

  if (absoluteChange >= 5) {
    return "Moderate";
  }

  return "Minimal";
};

/*
 * Detect rapid deterioration.
 *
 * A rapid deterioration requires:
 * 1. Risk to be increasing.
 * 2. Increase of at least 10 points.
 */
const detectRapidDeterioration = (
  riskChange
) => {
  return riskChange >= 10;
};

/*
 * Generate a decision-support recommendation.
 */
const getRecommendation = ({
  currentRiskScore,
  trend,
  rapidDeterioration,
}) => {
  if (
    rapidDeterioration &&
    currentRiskScore >= 70
  ) {
    return {
      level: "Immediate",
      message:
        "Rapid risk deterioration detected. Immediate assessment and early-warning preparedness are recommended.",
    };
  }

  if (
    trend.status === "Worsening" &&
    currentRiskScore >= 50
  ) {
    return {
      level: "High",
      message:
        "Risk is worsening. Increase monitoring frequency and review local environmental conditions.",
    };
  }

  if (
    trend.status === "Worsening"
  ) {
    return {
      level: "Enhanced",
      message:
        "Risk is increasing. Continue enhanced monitoring and watch for further deterioration.",
    };
  }

  if (
    trend.status === "Improving"
  ) {
    return {
      level: "Routine",
      message:
        "Risk is improving. Continue monitoring while maintaining normal preparedness.",
    };
  }

  return {
    level: "Routine",
    message:
      "Risk remains stable. Continue routine monitoring under current conditions.",
  };
};

/*
 * Analyze temporal risk movement.
 *
 * If there is no previous observation, the engine
 * establishes a baseline instead of inventing a trend.
 */
const analyzeTemporalRisk = ({
  location,
  currentRiskScore,
  environmentalInputs = {},
}) => {
  if (!location) {
    throw new Error(
      "Location is required for temporal risk analysis."
    );
  }

  const numericCurrentScore =
    toNumber(currentRiskScore);

  if (
    numericCurrentScore === null ||
    numericCurrentScore < 0 ||
    numericCurrentScore > 100
  ) {
    throw new Error(
      "Current risk score must be a number between 0 and 100."
    );
  }

  /*
   * Retrieve the latest observation BEFORE storing
   * the current observation.
   */
  const previousObservation =
    getPreviousObservation(location);

  /*
   * Record the current observation.
   */
  const currentObservation =
    recordObservation(
      location,
      numericCurrentScore,
      environmentalInputs
    );

  /*
   * First observation = baseline.
   */
  if (!previousObservation) {
    return {
      available: false,

      status: "Baseline",

      location,

      currentRiskScore:
        currentObservation.riskScore,

      previousRiskScore: null,

      riskChange: null,

      riskChangePercent: null,

      trend: {
        status: "Baseline",
        direction: "neutral",
        explanation:
          "This is the first recorded observation for this region. A future observation is required to calculate risk movement.",
      },

      escalation: "Baseline",

      rapidDeterioration: false,

      recommendation: {
        level: "Routine",
        message:
          "Baseline established. Continue monitoring to identify future changes in risk.",
      },

      observation: currentObservation,
    };
  }

  const previousRiskScore =
    previousObservation.riskScore;

  const currentRisk =
    currentObservation.riskScore;

  const riskChange =
    round(
      currentRisk -
        previousRiskScore
    );

  let riskChangePercent = 0;

  if (previousRiskScore !== 0) {
    riskChangePercent =
      round(
        (riskChange /
          previousRiskScore) *
          100
      );
  } else if (currentRisk > 0) {
    riskChangePercent = 100;
  }

  const trend =
    getTrend(riskChange);

  const escalation =
    getEscalation(riskChange);

  const rapidDeterioration =
    detectRapidDeterioration(
      riskChange
    );

  const recommendation =
    getRecommendation({
      currentRiskScore: currentRisk,
      trend,
      rapidDeterioration,
    });

  return {
    available: true,

    status: "Analyzed",

    location,

    currentRiskScore: currentRisk,

    previousRiskScore,

    riskChange,

    riskChangePercent,

    trend,

    escalation,

    rapidDeterioration,

    recommendation,

    observation: currentObservation,

    previousObservation,
  };
};

/*
 * Get temporal summary for a region.
 */
const getTemporalSummary = (
  location
) => {
  const history =
    getObservationHistory(location);

  if (!history.length) {
    return {
      available: false,
      location,
      observationCount: 0,
      message:
        "No temporal observations are available for this region.",
    };
  }

  const latest =
    history[history.length - 1];

  const previous =
    history.length >= 2
      ? history[history.length - 2]
      : null;

  return {
    available: true,

    location,

    observationCount:
      history.length,

    latestObservation: latest,

    previousObservation:
      previous,

    firstObservation:
      history[0],

    history,
  };
};

/*
 * Clear history for one region.
 */
const clearRegionHistory = (
  location
) => {
  observationHistory.delete(location);

  return {
    success: true,
    location,
    message:
      "Temporal observation history cleared for the requested region.",
  };
};

/*
 * Clear all temporal observations.
 */
const clearAllHistory = () => {
  observationHistory.clear();

  return {
    success: true,
    message:
      "All temporal observation history has been cleared.",
  };
};

module.exports = {
  analyzeTemporalRisk,
  recordObservation,
  getPreviousObservation,
  getObservationHistory,
  getTemporalSummary,
  clearRegionHistory,
  clearAllHistory,
};