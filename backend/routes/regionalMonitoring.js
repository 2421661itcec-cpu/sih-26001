/*
 * SIH 26001
 * Regional Monitoring Route
 *
 * Day 3 - Phase 3
 *
 * This module connects the regional monitoring data layer
 * with the existing Day 2 risk prediction engine.
 */

const express = require("express");

const {
  getMonitoredRegions,
  getRegionalData,
  getAllRegionalData,
} = require("./regionalMonitoringData");

/*
 * Creates the regional monitoring router.
 *
 * calculateRiskPrediction is passed from server.js so the
 * regional monitoring system uses the exact same risk engine
 * as the existing /api/risk/predict endpoint.
 */
const createRegionalMonitoringRouter = (
  calculateRiskPrediction
) => {
  const router = express.Router();

  /*
   * GET /api/regional-monitoring
   *
   * Returns risk information for all monitored NER regions.
   */
  router.get("/regional-monitoring", (req, res) => {
    try {
      const regionalData = getAllRegionalData();

      const monitoringResults = regionalData.map(
        (regionData) => {
          const prediction = calculateRiskPrediction(
            regionData.location,
            regionData.environmentalInputs
          );

          return prediction;
        }
      );

      const summary = {
        totalRegions: monitoringResults.length,

        criticalRegions: monitoringResults.filter(
          (region) => region.riskLevel === "Critical"
        ).length,

        highRiskRegions: monitoringResults.filter(
          (region) => region.riskLevel === "High"
        ).length,

        moderateRiskRegions: monitoringResults.filter(
          (region) => region.riskLevel === "Moderate"
        ).length,

        lowRiskRegions: monitoringResults.filter(
          (region) => region.riskLevel === "Low"
        ).length,

        immediatePriorityRegions:
          monitoringResults.filter(
            (region) =>
              region.monitoringPriority === "Immediate"
          ).length,

        highPriorityRegions:
          monitoringResults.filter(
            (region) =>
              region.monitoringPriority === "High"
          ).length,
      };

      const sortedRegions = [...monitoringResults].sort(
        (a, b) => b.riskScore - a.riskScore
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
                  sortedRegions[0].monitoringPriority,
              }
            : null,

        regions: monitoringResults,
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
  });

  /*
   * GET /api/regional-monitoring/:region
   *
   * Returns detailed monitoring information for one region.
   */
  router.get(
    "/regional-monitoring/:region",
    (req, res) => {
      try {
        const regionName =
          req.params.region;

        const decodedRegion =
          decodeURIComponent(regionName);

        const regionalData =
          getRegionalData(decodedRegion);

        if (!regionalData) {
          return res.status(404).json({
            success: false,
            message:
              "Requested region is not available in the regional monitoring dataset.",
          });
        }

        const prediction =
          calculateRiskPrediction(
            regionalData.location,
            regionalData.environmentalInputs
          );

        return res.status(200).json({
          success: true,
          dataSource:
            regionalData.dataSource,
          prediction,
        });
      } catch (error) {
        console.error(
          "Regional detail error:",
          error
        );

        return res.status(500).json({
          success: false,
          message:
            "Unable to generate regional risk information.",
        });
      }
    }
  );

  /*
   * GET /api/regions
   *
   * Returns the list of monitored regions.
   */
  router.get("/regions", (req, res) => {
    try {
      const regions =
        getMonitoredRegions();

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

  return router;
};

module.exports =
  createRegionalMonitoringRouter;