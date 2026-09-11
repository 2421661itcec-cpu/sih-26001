const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  analyzeTemporalRisk,
} = require("./services/temporalRiskEngine");

const {
  sendPushToFids,
} = require("./services/fcmService");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/*
 * D8.2 Prototype FCM Device Registry
 *
 * Stores Firebase Installation IDs (FIDs) for the small
 * SIH prototype team. The registry is intentionally in-memory
 * for screening and resets when the backend restarts.
 */
const notificationDevices = new Map();

/*
 * D8.3 — Centralized risk-transition notification state.
 *
 * Stores the last risk level that generated a push for each region.
 * This prevents duplicate notifications when multiple dashboards
 * are monitoring the same region.
 *
 * Prototype-only in-memory state.
 */
const lastNotifiedRiskLevels = new Map();

const REGIONAL_PROFILES = {
  Sikkim: {
    susceptibility: 1.10,
    terrain: "Mountainous and steep terrain",
    context:
      "High-altitude terrain with steep slopes and rainfall-triggered landslide susceptibility.",
  },

  "Arunachal Pradesh": {
    susceptibility: 1.12,
    terrain: "Mountainous and highly dissected terrain",
    context:
      "Mountain terrain with steep slopes and intense monsoon rainfall exposure.",
  },

  Assam: {
    susceptibility: 0.96,
    terrain: "Plains with localized hill regions",
    context:
      "Generally lower terrain susceptibility with elevated risk in hilly and rainfall-affected areas.",
  },

  Meghalaya: {
    susceptibility: 1.08,
    terrain: "Plateau and hilly terrain",
    context:
      "Hilly terrain with heavy monsoon rainfall that can increase slope instability.",
  },

  Manipur: {
    susceptibility: 1.05,
    terrain: "Hilly and mountainous terrain",
    context:
      "Extensive hill regions where rainfall and terrain conditions can contribute to landslide risk.",
  },

  Mizoram: {
    susceptibility: 1.10,
    terrain: "Steep hill terrain",
    context:
      "Steep and highly dissected terrain with significant rainfall-related slope instability potential.",
  },

  Nagaland: {
    susceptibility: 1.07,
    terrain: "Hilly and mountainous terrain",
    context:
      "Mountainous terrain where heavy rainfall and slope conditions can increase landslide susceptibility.",
  },

  Tripura: {
    susceptibility: 1.00,
    terrain: "Low hills and undulating terrain",
    context:
      "Undulating terrain with localized landslide susceptibility during intense rainfall events.",
  },
};

const DEFAULT_REGIONAL_PROFILE = {
  susceptibility: 1.00,
  terrain: "Regional terrain",
  context: "General regional susceptibility profile.",
};

/*
 * D3 Prototype Regional Monitoring Inputs
 *
 * These values represent simulated/current-condition prototype
 * inputs for dashboard development.
 *
 * They are NOT live sensor, satellite, weather, or government data.
 *
 * This structure is intentionally kept separate so that real
 * data sources can replace these values later.
 */
const REGIONAL_MONITORING_INPUTS = {
  Sikkim: {
    rainfall: 235,
    slope: 47,
    soilMoisture: 82,
    soilStability: 27,
  },

  "Arunachal Pradesh": {
    rainfall: 250,
    slope: 49,
    soilMoisture: 85,
    soilStability: 25,
  },

  Assam: {
    rainfall: 145,
    slope: 22,
    soilMoisture: 61,
    soilStability: 54,
  },

  Meghalaya: {
    rainfall: 220,
    slope: 42,
    soilMoisture: 79,
    soilStability: 34,
  },

  Manipur: {
    rainfall: 185,
    slope: 38,
    soilMoisture: 70,
    soilStability: 42,
  },

  Mizoram: {
    rainfall: 230,
    slope: 46,
    soilMoisture: 81,
    soilStability: 29,
  },

  Nagaland: {
    rainfall: 195,
    slope: 40,
    soilMoisture: 73,
    soilStability: 39,
  },

  Tripura: {
    rainfall: 155,
    slope: 28,
    soilMoisture: 64,
    soilStability: 51,
  },
};

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const normalize = (value, min, max) => {
  return ((value - min) / (max - min)) * 100;
};

const calculateRainfallRisk = (rainfall) => {
  return clamp(normalize(rainfall, 0, 300), 0, 100);
};

const calculateSlopeRisk = (slope) => {
  if (slope <= 15) {
    return 10;
  }

  if (slope <= 30) {
    return 35;
  }

  if (slope <= 45) {
    return 70;
  }

  return 100;
};

const calculateMoistureRisk = (soilMoisture) => {
  return clamp(normalize(soilMoisture, 0, 100), 0, 100);
};

const calculateStabilityRisk = (soilStability) => {
  return clamp(100 - soilStability, 0, 100);
};

const getRiskLevel = (score) => {
  if (score < 25) {
    return "Low";
  }

  if (score < 50) {
    return "Moderate";
  }

  if (score < 75) {
    return "High";
  }

  return "Critical";
};

const getWarningMessage = (riskLevel) => {
  if (riskLevel === "Critical") {
    return "Immediate landslide warning. Authorities should assess the affected area and consider emergency response measures.";
  }

  if (riskLevel === "High") {
    return "High landslide risk detected. Increased monitoring and early warning preparedness are recommended.";
  }

  if (riskLevel === "Moderate") {
    return "Moderate landslide risk detected. Continue monitoring environmental and terrain conditions.";
  }

  return "Low landslide risk detected. Continue routine monitoring.";
};

const getRiskFactors = ({
  rainfall,
  slope,
  soilMoisture,
  soilStability,
}) => {
  const factors = [];

  if (rainfall >= 200) {
    factors.push({
      parameter: "Rainfall",
      value: rainfall,
      impact: "High",
      message:
        "Heavy rainfall is increasing the likelihood of slope failure.",
    });
  } else if (rainfall >= 120) {
    factors.push({
      parameter: "Rainfall",
      value: rainfall,
      impact: "Moderate",
      message:
        "Rainfall is contributing moderately to landslide risk.",
    });
  }

  if (slope >= 45) {
    factors.push({
      parameter: "Slope",
      value: slope,
      impact: "High",
      message:
        "Steep terrain significantly increases slope instability.",
    });
  } else if (slope >= 30) {
    factors.push({
      parameter: "Slope",
      value: slope,
      impact: "Moderate",
      message:
        "Terrain slope is contributing to landslide susceptibility.",
    });
  }

  if (soilMoisture >= 75) {
    factors.push({
      parameter: "Soil Moisture",
      value: soilMoisture,
      impact: "High",
      message:
        "High soil moisture can reduce soil strength and increase instability.",
    });
  } else if (soilMoisture >= 50) {
    factors.push({
      parameter: "Soil Moisture",
      value: soilMoisture,
      impact: "Moderate",
      message:
        "Elevated soil moisture is contributing to instability.",
    });
  }

  if (soilStability <= 30) {
    factors.push({
      parameter: "Soil Stability",
      value: soilStability,
      impact: "High",
      message:
        "Low soil stability is strongly increasing landslide susceptibility.",
    });
  } else if (soilStability <= 50) {
    factors.push({
      parameter: "Soil Stability",
      value: soilStability,
      impact: "Moderate",
      message:
        "Reduced soil stability is contributing to landslide risk.",
    });
  }

  return factors;
};

/*
 * Phase 5:
 * Determine a prototype trend from the current environmental conditions.
 *
 * This is NOT a historical time-series prediction.
 * It provides a current-condition trend indicator until
 * real historical/sensor data is integrated.
 */
const getRiskTrend = ({
  riskScore,
  rainfall,
  slope,
  soilMoisture,
  soilStability,
}) => {
  let severitySignals = 0;

  if (rainfall >= 200) {
    severitySignals += 1;
  }

  if (slope >= 45) {
    severitySignals += 1;
  }

  if (soilMoisture >= 75) {
    severitySignals += 1;
  }

  if (soilStability <= 30) {
    severitySignals += 1;
  }

  if (riskScore >= 75 || severitySignals >= 3) {
    return {
      trend: "Increasing",
      reason:
        "Multiple severe environmental conditions indicate that landslide risk is increasing.",
    };
  }

  if (riskScore >= 50 || severitySignals >= 1) {
    return {
      trend: "Elevated",
      reason:
        "One or more environmental conditions are contributing to elevated landslide risk.",
    };
  }

  return {
    trend: "Stable",
    reason:
      "Current environmental conditions indicate relatively stable landslide risk.",
  };
};

const getMonitoringPriority = (riskLevel, trend) => {
  if (riskLevel === "Critical") {
    return "Immediate";
  }

  if (riskLevel === "High" || trend === "Increasing") {
    return "High";
  }

  if (riskLevel === "Moderate" || trend === "Elevated") {
    return "Medium";
  }

  return "Low";
};

/*
 * Shared risk calculation function
 *
 * D3 uses the same risk engine as /api/risk/predict.
 * This prevents the regional monitoring layer from creating
 * a second, inconsistent risk calculation system.
 */
const calculateRiskPrediction = (
  location,
  environmentalInputs
) => {
  const numericInputs = {
    rainfall: Number(environmentalInputs.rainfall),
    slope: Number(environmentalInputs.slope),
    soilMoisture: Number(environmentalInputs.soilMoisture),
    soilStability: Number(environmentalInputs.soilStability),
  };

  const hasInvalidInput = Object.values(numericInputs).some(
    (value) => Number.isNaN(value)
  );

  if (!location || hasInvalidInput) {
    throw new Error(
      "Location and all environmental parameters are required."
    );
  }

  const isOutOfRange =
    numericInputs.rainfall < 0 ||
    numericInputs.rainfall > 300 ||
    numericInputs.slope < 0 ||
    numericInputs.slope > 60 ||
    numericInputs.soilMoisture < 0 ||
    numericInputs.soilMoisture > 100 ||
    numericInputs.soilStability < 0 ||
    numericInputs.soilStability > 100;

  if (isOutOfRange) {
    throw new Error(
      "One or more input values are outside the allowed range."
    );
  }

  const rainfallRisk = calculateRainfallRisk(
    numericInputs.rainfall
  );

  const slopeRisk = calculateSlopeRisk(
    numericInputs.slope
  );

  const moistureRisk = calculateMoistureRisk(
    numericInputs.soilMoisture
  );

  const stabilityRisk = calculateStabilityRisk(
    numericInputs.soilStability
  );

  const environmentalScore =
    rainfallRisk * 0.30 +
    slopeRisk * 0.25 +
    moistureRisk * 0.25 +
    stabilityRisk * 0.20;

  const regionalProfile =
    REGIONAL_PROFILES[location] ||
    DEFAULT_REGIONAL_PROFILE;

  const regionalAdjustment =
    regionalProfile.susceptibility;

  const adjustedScore =
    environmentalScore *
    regionalAdjustment;

  const riskScore = Math.round(
    clamp(adjustedScore, 0, 100)
  );

  const riskLevel = getRiskLevel(riskScore);

  const factors = getRiskFactors(numericInputs);

  const trendResult = getRiskTrend({
    riskScore,
    rainfall: numericInputs.rainfall,
    slope: numericInputs.slope,
    soilMoisture: numericInputs.soilMoisture,
    soilStability: numericInputs.soilStability,
  });

  const monitoringPriority =
    getMonitoringPriority(
      riskLevel,
      trendResult.trend
    );

  return {
    location,

    riskScore,

    riskLevel,

    warning: getWarningMessage(riskLevel),

    factors,

    trend: {
      status: trendResult.trend,
      reason: trendResult.reason,
    },

    monitoringPriority,

    regionalProfile: {
      terrain: regionalProfile.terrain,
      context: regionalProfile.context,
      susceptibility:
        regionalProfile.susceptibility,
    },

    inputSummary: {
      rainfall: numericInputs.rainfall,
      slope: numericInputs.slope,
      soilMoisture:
        numericInputs.soilMoisture,
      soilStability:
        numericInputs.soilStability,
    },

    model: {
      type:
        "Prototype Weighted Environmental Risk Model with Regional Susceptibility Layer",

      version: "1.2",

      weights: {
        rainfall: 0.30,
        slope: 0.25,
        soilMoisture: 0.25,
        soilStability: 0.20,
      },

      regionalAdjustment,

      trendAnalysis:
        "Current-condition severity analysis; historical time-series data not yet integrated.",
    },
  };
};

/*
 * D6 / Phase 8 Regional Temporal Monitoring
 *
 * Regional monitoring may be refreshed frequently by the frontend.
 * We therefore DO NOT create a new temporal observation on every
 * API request.
 *
 * A new regional observation is recorded at most once every
 * five minutes for each region.
 */
const REGIONAL_TEMPORAL_INTERVAL_MS =
  5 * 60 * 1000;

const regionalTemporalCache = new Map();

const getRegionalTemporalRisk = (
  region,
  prediction
) => {
  const now = Date.now();

  const cached =
    regionalTemporalCache.get(region);

  const shouldRecordObservation =
    !cached ||
    now - cached.recordedAt >=
      REGIONAL_TEMPORAL_INTERVAL_MS;

  if (shouldRecordObservation) {
    const temporalRisk =
      analyzeTemporalRisk({
        location: region,
        currentRiskScore:
          prediction.riskScore,
        environmentalInputs:
          prediction.inputSummary,
      });

    regionalTemporalCache.set(region, {
      recordedAt: now,
      temporalRisk,
    });

    return temporalRisk;
  }

  return cached.temporalRisk;
};

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "SIH 26001 Landslide Risk Monitoring System API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "SIH 26001 Backend",
  });
});

app.post("/api/risk/predict", (req, res) => {
  try {
    const {
      location,
      rainfall,
      slope,
      soilMoisture,
      soilStability,
    } = req.body;

    const prediction =
      calculateRiskPrediction(location, {
        rainfall,
        slope,
        soilMoisture,
        soilStability,
      });

    /*
     * D6:
     * Compare the current prediction against the previous
     * recorded observation for the same region.
     *
     * The temporal engine uses in-memory prototype history.
     */
    const temporalRisk =
      analyzeTemporalRisk({
        location,
        currentRiskScore:
          prediction.riskScore,
        environmentalInputs:
          prediction.inputSummary,
      });

    return res.status(200).json({
      success: true,

      prediction,

      temporalRisk,
    });
  } catch (error) {
    console.error(
      "Risk prediction error:",
      error
    );

    const isValidationError =
      error.message ===
        "Location and all environmental parameters are required." ||
      error.message ===
        "One or more input values are outside the allowed range.";

    return res
      .status(
        isValidationError ? 400 : 500
      )
      .json({
        success: false,
        message: isValidationError
          ? error.message
          : "Unable to calculate landslide risk.",
      });
  }
});

/*
 * D3 + D6 Regional Monitoring API
 *
 * Returns risk information for all monitored NER regions.
 *
 * D3:
 * Prototype regional risk intelligence.
 *
 * D6 / Phase 8:
 * Adds temporal comparison for each region.
 *
 * The regional temporal observation is intentionally rate-limited
 * to avoid treating every frontend refresh as a new observation.
 */
app.get(
  "/api/regional-monitoring",
  (req, res) => {
    try {
      const regions = Object.keys(
        REGIONAL_MONITORING_INPUTS
      );

      const monitoringResults =
        regions.map((region) => {
          const prediction =
            calculateRiskPrediction(
              region,
              REGIONAL_MONITORING_INPUTS[
                region
              ]
            );

          const temporalRisk =
            getRegionalTemporalRisk(
              region,
              prediction
            );

          return {
            ...prediction,

            temporalRisk,
          };
        });

      const summary = {
        totalRegions:
          monitoringResults.length,

        criticalRegions:
          monitoringResults.filter(
            (region) =>
              region.riskLevel ===
              "Critical"
          ).length,

        highRiskRegions:
          monitoringResults.filter(
            (region) =>
              region.riskLevel ===
              "High"
          ).length,

        moderateRiskRegions:
          monitoringResults.filter(
            (region) =>
              region.riskLevel ===
              "Moderate"
          ).length,

        lowRiskRegions:
          monitoringResults.filter(
            (region) =>
              region.riskLevel ===
              "Low"
          ).length,

        immediatePriorityRegions:
          monitoringResults.filter(
            (region) =>
              region.monitoringPriority ===
              "Immediate"
          ).length,

        highPriorityRegions:
          monitoringResults.filter(
            (region) =>
              region.monitoringPriority ===
              "High"
          ).length,

        temporalWorseningRegions:
          monitoringResults.filter(
            (region) =>
              region.temporalRisk &&
              region.temporalRisk.trend &&
              region.temporalRisk.trend.status ===
                "Worsening"
          ).length,

        temporalImprovingRegions:
          monitoringResults.filter(
            (region) =>
              region.temporalRisk &&
              region.temporalRisk.trend &&
              region.temporalRisk.trend.status ===
                "Improving"
          ).length,

        rapidDeteriorationRegions:
          monitoringResults.filter(
            (region) =>
              region.temporalRisk &&
              region.temporalRisk.rapidDeterioration ===
                true
          ).length,
      };

      const sortedRegions =
        [...monitoringResults].sort(
          (a, b) =>
            b.riskScore - a.riskScore
        );

      const temporalPriorityRegions =
        [...monitoringResults].sort(
          (a, b) => {
            const aChange =
              a.temporalRisk &&
              Number.isFinite(
                a.temporalRisk.riskChange
              )
                ? a.temporalRisk.riskChange
                : -Infinity;

            const bChange =
              b.temporalRisk &&
              Number.isFinite(
                b.temporalRisk.riskChange
              )
                ? b.temporalRisk.riskChange
                : -Infinity;

            return bChange - aChange;
          }
        );

      return res.status(200).json({
        success: true,

        dataSource: {
          type:
            "Prototype simulated environmental monitoring inputs",

          liveData: false,

          note:
            "Values are for prototype demonstration and should be replaced with validated real-world data sources before operational deployment.",
        },

        temporalMonitoring: {
          enabled: true,

          observationInterval:
            "5 minutes",

          historyType:
            "In-memory prototype observations",

          note:
            "Regional temporal observations are rate-limited so repeated dashboard refreshes do not create artificial historical observations.",
        },

        summary,

        highestRiskRegion:
          sortedRegions.length > 0
            ? {
                location:
                  sortedRegions[0].location,

                riskScore:
                  sortedRegions[0].riskScore,

                riskLevel:
                  sortedRegions[0].riskLevel,

                monitoringPriority:
                  sortedRegions[0]
                    .monitoringPriority,
              }
            : null,

        highestWorseningRegion:
          temporalPriorityRegions.length > 0 &&
          temporalPriorityRegions[0]
            .temporalRisk &&
          temporalPriorityRegions[0]
            .temporalRisk.available
            ? {
                location:
                  temporalPriorityRegions[0]
                    .location,

                riskChange:
                  temporalPriorityRegions[0]
                    .temporalRisk
                    .riskChange,

                riskChangePercent:
                  temporalPriorityRegions[0]
                    .temporalRisk
                    .riskChangePercent,

                trend:
                  temporalPriorityRegions[0]
                    .temporalRisk
                    .trend
                    .status,

                escalation:
                  temporalPriorityRegions[0]
                    .temporalRisk
                    .escalation,

                rapidDeterioration:
                  temporalPriorityRegions[0]
                    .temporalRisk
                    .rapidDeterioration,
              }
            : null,

        regions:
          monitoringResults,
      });
    } catch (error) {
      console.error(
        "Regional monitoring error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to generate regional monitoring data.",
      });
    }
  }
);

/*
 * D3 Region List API
 *
 * Provides the frontend with the list of regions and their
 * regional susceptibility information.
 */
app.get("/api/regions", (req, res) => {
  try {
    const regions =
      Object.entries(
        REGIONAL_PROFILES
      ).map(
        ([name, profile]) => ({
          name,

          susceptibility:
            profile.susceptibility,

          terrain:
            profile.terrain,

          context:
            profile.context,
        })
      );

    return res.status(200).json({
      success: true,
      count: regions.length,
      regions,
    });
  } catch (error) {
    console.error(
      "Region list error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load regional information.",
    });
  }
});

/*
 * D8.2 — Register FCM device
 */
app.post("/api/notifications/register", (req, res) => {
  try {
    const { fid, deviceName } = req.body || {};

    if (
      typeof fid !== "string" ||
      fid.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Firebase Installation ID (FID) is required.",
      });
    }

    const cleanFid = fid.trim();

    const cleanDeviceName =
      typeof deviceName === "string" &&
      deviceName.trim().length > 0
        ? deviceName.trim()
        : `Prototype Device ${
            notificationDevices.size + 1
          }`;

    const existingDevice =
      notificationDevices.get(
        cleanFid
      );

    const now =
      new Date().toISOString();

    notificationDevices.set(
      cleanFid,
      {
        fid: cleanFid,
        deviceName: cleanDeviceName,
        registeredAt:
          existingDevice?.registeredAt ||
          now,
        lastSeenAt: now,
      }
    );

    console.log(
      `FCM device registered: ${cleanDeviceName}`
    );

    return res.json({
      success: true,
      message:
        "Device registered for SIH 26001 push notifications.",
      deviceName: cleanDeviceName,
      deviceCount:
        notificationDevices.size,
    });
  } catch (error) {
    console.error(
      "FCM device registration error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Unable to register notification device.",
    });
  }
});

/*
 * D8.2 — List registered devices
 * FIDs are intentionally not returned.
 */
app.get(
  "/api/notifications/devices",
  (req, res) => {
    try {
      const devices =
        Array.from(
          notificationDevices.values()
        ).map(
          (device) => ({
            deviceName:
              device.deviceName,

            registeredAt:
              device.registeredAt,

            lastSeenAt:
              device.lastSeenAt,
          })
        );

      return res.json({
        success: true,
        deviceCount:
          devices.length,
        devices,
      });
    } catch (error) {
      console.error(
        "FCM device listing error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load notification devices.",
      });
    }
  }
);

/*
 * D8.3 — Send an automatic risk-transition alert
 *
 * The frontend reports every actual regional risk-level transition.
 * The backend centrally deduplicates the transition so multiple
 * dashboard clients cannot send duplicate pushes for the same
 * region + risk level.
 */
app.post(
  "/api/notifications/alert",
  async (req, res) => {
    try {
      const {
        region,
        riskScore,
        riskLevel,
        previousRiskLevel,
        severity,
        rainfall,
        soilStability,
        soilMoisture,
        slopeSusceptibility,
        reason,
        action,
      } = req.body || {};

      const cleanRegion =
        typeof region === "string" &&
        region.trim().length > 0
          ? region.trim()
          : "NER Region";

      const cleanRiskLevel =
        typeof riskLevel === "string" &&
        riskLevel.trim().length > 0
          ? riskLevel.trim()
          : "High";

      const cleanPreviousRiskLevel =
        typeof previousRiskLevel === "string" &&
        previousRiskLevel.trim().length > 0
          ? previousRiskLevel.trim()
          : null;

      /*
       * Never create a notification from the first baseline reading.
       * A push requires an actual previous -> current transition.
       */
      if (
        !cleanPreviousRiskLevel ||
        cleanPreviousRiskLevel === cleanRiskLevel
      ) {
        return res.json({
          success: true,
          notificationSent: false,
          reason: "No risk-level transition detected.",
          region: cleanRegion,
          previousRiskLevel: cleanPreviousRiskLevel,
          riskLevel: cleanRiskLevel,
        });
      }

      /*
       * Central duplicate protection.
       * If another dashboard already notified this exact region
       * at this exact risk level, do not send it again.
       */
      const lastNotifiedLevel =
        lastNotifiedRiskLevels.get(cleanRegion);

      if (lastNotifiedLevel === cleanRiskLevel) {
        return res.json({
          success: true,
          notificationSent: false,
          reason:
            "Duplicate risk level already notified for this region.",
          region: cleanRegion,
          previousRiskLevel: cleanPreviousRiskLevel,
          riskLevel: cleanRiskLevel,
        });
      }

      const fids =
        Array.from(
          notificationDevices.keys()
        );

      if (fids.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "No notification devices are registered yet.",
        });
      }

      const numericRiskScore =
        Number(riskScore || 0);

      const cleanRainfall =
        Number.isFinite(Number(rainfall))
          ? Number(rainfall)
          : 0;

      const cleanSoilStability =
        Number.isFinite(Number(soilStability))
          ? Number(soilStability)
          : 0;

      const cleanSoilMoisture =
        Number.isFinite(Number(soilMoisture))
          ? Number(soilMoisture)
          : 0;

      let notificationTitle;

      if (cleanRiskLevel === "Critical") {
        notificationTitle =
          "🚨 CRITICAL LANDSLIDE ALERT";
      } else if (cleanRiskLevel === "High") {
        notificationTitle =
          "⚠️ HIGH LANDSLIDE ALERT";
      } else {
        notificationTitle =
          "ℹ️ LANDSLIDE RISK UPDATE";
      }

      const cleanReason =
        typeof reason === "string" &&
        reason.trim().length > 0
          ? reason.trim()
          : "Landslide risk conditions have changed.";

      const cleanAction =
        typeof action === "string" &&
        action.trim().length > 0
          ? action.trim()
          : "Continue monitoring environmental and terrain conditions.";

      const notificationBody =
        `${cleanRegion} — Risk ${numericRiskScore}/100

` +
        `Rainfall: ${cleanRainfall} mm/24h
` +
        `Soil Stability: ${cleanSoilStability}/100
` +
        `Soil Moisture: ${cleanSoilMoisture}%

` +
        `${cleanReason}

` +
        `${cleanAction}`;

      console.log(
        `Risk transition detected: ${cleanRegion} ` +
        `${cleanPreviousRiskLevel} → ${cleanRiskLevel}`
      );

      console.log(
        `Sending automatic FCM risk-transition alert to ` +
        `${fids.length} device(s)...`
      );

      const response =
        await sendPushToFids({
          fids,
          title: notificationTitle,
          body: notificationBody,
          data: {
            type:
              "SIH26001_RISK_LEVEL_CHANGE",

            region:
              cleanRegion,

            previousRiskLevel:
              cleanPreviousRiskLevel,

            riskLevel:
              cleanRiskLevel,

            riskScore:
              numericRiskScore,

            rainfall:
              cleanRainfall,

            soilStability:
              cleanSoilStability,

            soilMoisture:
              cleanSoilMoisture,

            slopeSusceptibility:
              Number(
                slopeSusceptibility || 0
              ),

            severity:
              typeof severity === "string"
                ? severity
                : cleanRiskLevel.toUpperCase(),

            reason:
              cleanReason,

            action:
              cleanAction,

            timestamp:
              new Date().toISOString(),
          },
        });

      /*
       * Only mark the transition as notified after FCM has
       * successfully processed the multicast request.
       */
      if (response.successCount > 0) {
        lastNotifiedRiskLevels.set(
          cleanRegion,
          cleanRiskLevel
        );
      }

      console.log(
        "FCM automatic risk-transition result:",
        {
          region: cleanRegion,
          previousRiskLevel:
            cleanPreviousRiskLevel,
          riskLevel:
            cleanRiskLevel,
          successCount:
            response.successCount,
          failureCount:
            response.failureCount,
        }
      );

      return res.json({
        success: true,
        notificationSent:
          response.successCount > 0,
        region:
          cleanRegion,
        previousRiskLevel:
          cleanPreviousRiskLevel,
        riskLevel:
          cleanRiskLevel,
        deviceCount:
          fids.length,
        successCount:
          response.successCount,
        failureCount:
          response.failureCount,
      });
    } catch (error) {
      console.error(
        "FCM automatic risk-transition error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Unable to send automatic FCM risk-transition alert.",
      });
    }
  }
);

/*
 * D8.2 — Send a test push to every registered prototype device
 */
app.post(
  "/api/notifications/test",
  async (req, res) => {
    try {
      const {
        title,
        body,
      } = req.body || {};

      const fids =
        Array.from(
          notificationDevices.keys()
        );

      if (fids.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "No notification devices are registered yet.",
        });
      }

      const notificationTitle =
        typeof title === "string" &&
        title.trim().length > 0
          ? title.trim()
          : "SIH 26001 Test Alert";

      const notificationBody =
        typeof body === "string" &&
        body.trim().length > 0
          ? body.trim()
          : "Firebase push notifications are working.";

      console.log(
        `Sending FCM test notification to ${fids.length} device(s)...`
      );

      const response =
        await sendPushToFids({
          fids,
          title:
            notificationTitle,
          body:
            notificationBody,
          data: {
            type:
              "SIH26001_TEST_ALERT",

            timestamp:
              new Date().toISOString(),
          },
        });

      console.log(
        "FCM test notification result:",
        response
      );

      return res.json({
        success: true,

        message:
          "FCM test notification sent.",

        deviceCount:
          fids.length,

        successCount:
          response.successCount,

        failureCount:
          response.failureCount,
      });
    } catch (error) {
      console.error(
        "FCM test notification error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Unable to send FCM test notification.",
      });
    }
  }
);

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SIH 26001 backend running on http://0.0.0.0:${PORT}`
    );
  }
);

server.on("error", (error) => {
  console.error(
    "Backend server error:",
    error
  );
});

process.on("SIGINT", () => {
  console.log(
    "\nShutting down SIH 26001 backend..."
  );

  server.close(() => {
    console.log(
      "Backend server stopped."
    );

    process.exit(0);
  });
});