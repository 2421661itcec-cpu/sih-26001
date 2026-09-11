import { useEffect, useRef, useState } from "react";
import "./App.css";
import RiskMap from "./components/RiskMap";
import { registerForPushNotifications } from "./firebaseMessaging";
import {
  DEFAULT_RISK_INPUTS,
  NER_LOCATIONS,
  RISK_INPUT_LIMITS,
} from "./utils/riskData";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [parameters, setParameters] = useState(DEFAULT_RISK_INPUTS);

  const [riskResult, setRiskResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [predictionError, setPredictionError] = useState("");

  const [regionalData, setRegionalData] = useState(null);
  const [isLoadingRegionalData, setIsLoadingRegionalData] =
    useState(false);
  const [regionalError, setRegionalError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedRegion, setSelectedRegion] = useState(null);
  const [scenarioMode, setScenarioMode] = useState("baseline");
  const [baselineReference, setBaselineReference] = useState(null);

  // D8 Alert Engine
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [notificationStatus, setNotificationStatus] = useState("default");
  const previousRegionalLevels = useRef({});

  const handleLogin = (event) => {
    event.preventDefault();
    setLoginError("");

    if (loginUsername.trim() === "admin" && loginPassword === "geopulse2026") {
      setIsAuthenticated(true);
      setLoginUsername("");
      setLoginPassword("");
      return;
    }

    setLoginError("Invalid username or password. Please use the demo credentials.");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError("");
  };

  useEffect(() => {
    fetch("https://sih-26001-1.onrender.com/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend request failed");
        }

        return response.json();
      })
      .then((data) => {
        if (data.success && data.status === "healthy") {
          setBackendStatus("Online");
        } else {
          setBackendStatus("Unavailable");
        }
      })
      .catch(() => {
        setBackendStatus("Offline");
      });
  }, []);

  const getAlertSeverity = (region) => {
    if (!region) {
      return null;
    }

    if (
      region.riskLevel === "Critical" ||
      region.monitoringPriority === "Immediate"
    ) {
      return "CRITICAL";
    }

    if (
      region.riskLevel === "High" ||
      region.monitoringPriority === "High"
    ) {
      return "HIGH";
    }

    return null;
  };

  const getAlertAction = (region) => {
    if (!region) {
      return "Increase monitoring and review local preparedness.";
    }

    if (
      region.riskLevel === "Critical" ||
      region.monitoringPriority === "Immediate"
    ) {
      return "Immediate field assessment and emergency response preparedness are recommended.";
    }

    return "Increase monitoring frequency and maintain early-warning preparedness.";
  };

  const requestBrowserNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationStatus("unsupported");
      return "unsupported";
    }

    if (Notification.permission === "denied") {
      setNotificationStatus("denied");
      return "denied";
    }

    try {
      const result = await registerForPushNotifications();

      if (result?.success) {
        setNotificationStatus("granted");
        console.log(
          "SIH 26001 mobile push notifications enabled.",
          result
        );
        return "granted";
      }

      setNotificationStatus(
        result?.permission || Notification.permission || "default"
      );
      return result?.permission || "default";
    } catch (error) {
      console.error(
        "Mobile push notification registration failed:",
        error
      );

      setNotificationStatus(
        Notification.permission || "default"
      );

      return Notification.permission || "default";
    }
  };

  const sendBrowserAlert = async (alert) => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return false;
    }

    const notification = new Notification(
      `${alert.severity === "CRITICAL" ? "🚨" : "⚠️"} ${alert.severity} LANDSLIDE ALERT`,
      {
        body: `${alert.region} — Risk ${alert.riskScore}/100. ${alert.reason}`,
        tag: `sih-26001-${alert.region}`,
      }
    );

    notification.onclick = () => {
      window.focus();
    };

    return true;
  };

  const sendFcmRiskAlert = async (alert) => {
    try {
      const response = await fetch(
        "https://sih-26001-1.onrender.com/api/notifications/alert",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            region: alert.region,
            riskScore: alert.riskScore,
            riskLevel: alert.riskLevel,
            previousRiskLevel:
              alert.previousRiskLevel,
            severity: alert.severity,
            rainfall: alert.rainfall,
            soilStability:
              alert.soilStability,
            soilMoisture:
              alert.soilMoisture,
            slopeSusceptibility:
              alert.slopeSusceptibility,
            reason: alert.reason,
            action: alert.action,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            "Automatic FCM risk alert request failed."
        );
      }

      console.log(
        "SIH 26001 automatic FCM risk-transition result:",
        result
      );

      return result;
    } catch (error) {
      console.error(
        "Automatic FCM risk alert failed:",
        error
      );

      return null;
    }
  };

  const processRegionalAlerts = (regions) => {
    if (!Array.isArray(regions)) {
      return;
    }

    const newlyTriggeredAlerts = [];

    regions.forEach((region) => {
      const currentLevel =
        region.riskLevel || "Unknown";

      const previousLevel =
        previousRegionalLevels.current[
          region.location
        ];

      /*
       * First regional reading establishes the baseline.
       * It must never generate a notification.
       */
      const hasPreviousLevel =
        previousLevel !== undefined;

      /*
       * A notification is generated for EVERY actual
       * risk-level transition:
       *
       * Low → Moderate
       * Moderate → High
       * High → Critical
       * Critical → High
       * High → Moderate
       * Moderate → Low
       *
       * Same level → no notification.
       */
      const hasRiskTransition =
        hasPreviousLevel &&
        previousLevel !== currentLevel;

      const severity =
        getAlertSeverity(region);

      if (hasRiskTransition) {
        const alert = {
          id: `${region.location}-${Date.now()}`,

          region:
            region.location,

          riskScore:
            Number(region.riskScore || 0),

          riskLevel:
            currentLevel,

          previousRiskLevel:
            previousLevel,

          severity:
            severity || "UPDATE",

          rainfall:
            Number(
              region.inputSummary?.rainfall || 0
            ),

          soilStability:
            Number(
              region.inputSummary?.soilStability || 0
            ),

          soilMoisture:
            Number(
              region.inputSummary?.soilMoisture || 0
            ),

          slopeSusceptibility:
            Number(
              region.regionalProfile?.susceptibility ||
                0
            ),

          reason:
            region.warning ||
            region.trend?.reason ||
            "Landslide risk conditions have changed.",

          action:
            getAlertAction(region),

          timestamp:
            new Date().toISOString(),
        };

        /*
         * Only High/Critical transitions become
         * visible active alerts in the dashboard.
         *
         * FCM is still sent for EVERY risk-level
         * transition.
         */
        if (severity) {
          newlyTriggeredAlerts.push(alert);
        }

        /*
         * Central backend performs the final duplicate
         * protection and sends the push to every
         * subscribed device.
         */
        sendFcmRiskAlert(alert);
      }

      /*
       * Always update the baseline after processing
       * the current observation.
       */
      previousRegionalLevels.current[
        region.location
      ] = currentLevel;
    });

    if (newlyTriggeredAlerts.length === 0) {
      return;
    }

    setActiveAlerts((currentAlerts) => {
      const merged = [
        ...newlyTriggeredAlerts,
        ...currentAlerts,
      ];

      return merged.slice(0, 10);
    });

    newlyTriggeredAlerts.forEach((alert) => {
      sendBrowserAlert(alert).catch((error) => {
        console.error(
          "Browser alert error:",
          error
        );
      });
    });
  };

  const dismissAlert = (alertId) => {
    setActiveAlerts((currentAlerts) =>
      currentAlerts.filter((alert) => alert.id !== alertId)
    );
  };

  const fetchRegionalMonitoring = async () => {
    setIsLoadingRegionalData(true);
    setRegionalError("");

    try {
      const response = await fetch(
        "https://sih-26001-1.onrender.com/api/regional-monitoring"
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Regional monitoring request failed."
        );
      }

      setRegionalData(data);
      setLastUpdated(new Date());
      processRegionalAlerts(data.regions);

      setSelectedRegion((currentRegion) => {
        if (!currentRegion) {
          return null;
        }

        return (
          data.regions?.find(
            (region) =>
              region.location === currentRegion.location
          ) || null
        );
      });
    } catch (error) {
      console.error("Regional monitoring error:", error);

      setRegionalError(
        "Unable to load regional monitoring data. Make sure the backend is running."
      );

      setRegionalData(null);
      setSelectedRegion(null);
    } finally {
      setIsLoadingRegionalData(false);
    }
  };

  useEffect(() => {
    fetchRegionalMonitoring();

    const monitoringInterval = setInterval(() => {
      fetchRegionalMonitoring();
    }, 30000);

    return () => {
      clearInterval(monitoringInterval);
    };
  }, []);

  const isBaselineScenario = (candidateParameters = parameters) => {
    if (!selectedRegion?.inputSummary) {
      return false;
    }

    return (
      Number(candidateParameters.rainfall) ===
        Number(selectedRegion.inputSummary.rainfall) &&
      Number(candidateParameters.slope) ===
        Number(selectedRegion.inputSummary.slope) &&
      Number(candidateParameters.soilMoisture) ===
        Number(selectedRegion.inputSummary.soilMoisture) &&
      Number(candidateParameters.soilStability) ===
        Number(selectedRegion.inputSummary.soilStability)
    );
  };

  const getScenarioDifferences = (candidateParameters = parameters) => {
    if (!selectedRegion?.inputSummary) {
      return [];
    }

    const fields = [
      ["rainfall", "Rainfall", "mm"],
      ["slope", "Slope", "°"],
      ["soilMoisture", "Soil Moisture", "%"],
      ["soilStability", "Soil Stability", "%"],
    ];

    return fields
      .filter(
        ([key]) =>
          Number(candidateParameters[key]) !==
          Number(selectedRegion.inputSummary[key])
      )
      .map(([key, label, unit]) => ({
        key,
        label,
        unit,
        baseline: Number(selectedRegion.inputSummary[key]),
        current: Number(candidateParameters[key]),
      }));
  };

  const handleParameterChange = (event) => {
    const { name, value } = event.target;

    setParameters((currentParameters) => {
      const nextParameters = {
        ...currentParameters,
        [name]: Number(value),
      };

      setScenarioMode(
        isBaselineScenario(nextParameters) ? "baseline" : "what-if"
      );

      return nextParameters;
    });
  };

  const handleRegionSelect = (region) => {
    if (!region) {
      setSelectedRegion(null);
      return;
    }

    setSelectedRegion(region);
    setScenarioMode("baseline");
    setBaselineReference(null);

    setParameters((currentParameters) => ({
      ...currentParameters,
      location: region.location,
      ...(region.inputSummary || {}),
    }));
  };

  const handleLocationChange = (event) => {
    const location = event.target.value;
    const matchingRegion = regionalData?.regions?.find(
      (region) => region.location === location
    );

    if (matchingRegion) {
      handleRegionSelect(matchingRegion);
      return;
    }

    setParameters((currentParameters) => ({
      ...currentParameters,
      location,
    }));
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setPredictionError("");

    try {
      const response = await fetch(
        "https://sih-26001-1.onrender.com/api/risk/predict",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parameters),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Risk prediction request failed."
        );
      }

      const baselineScenario = isBaselineScenario(parameters);
      const scenarioDifferences = getScenarioDifferences(parameters);

      setScenarioMode(baselineScenario ? "baseline" : "what-if");

      if (baselineScenario) {
        setBaselineReference({
          location: parameters.location,
          riskScore: Number(data.prediction?.riskScore || 0),
          riskLevel: data.prediction?.riskLevel || "Unknown",
          inputs: {
            rainfall: Number(parameters.rainfall),
            slope: Number(parameters.slope),
            soilMoisture: Number(parameters.soilMoisture),
            soilStability: Number(parameters.soilStability),
          },
        });
      }

      setRiskResult({
        ...data.prediction,
        temporalRisk: data.temporalRisk,
        analyzedLocation: parameters.location,
        scenarioType: baselineScenario ? "baseline" : "what-if",
        scenarioDifferences,
        baselineReference: baselineScenario
          ? null
          : baselineReference,
      });

      const analyzedRiskLevel = data.prediction?.riskLevel;
      const analyzedRiskScore = Number(
        data.prediction?.riskScore || 0
      );

      if (
        analyzedRiskLevel === "High" ||
        analyzedRiskLevel === "Critical"
      ) {
        const directRiskAlert = {
          region: parameters.location,
          riskScore: analyzedRiskScore,
          riskLevel: analyzedRiskLevel,
          severity:
            analyzedRiskLevel === "Critical"
              ? "CRITICAL"
              : "HIGH",
          reason:
            data.prediction?.warning ||
            data.prediction?.explanation ||
            "Elevated landslide risk conditions detected by the risk prediction engine.",
          action: getAlertAction({
            riskLevel: analyzedRiskLevel,
            monitoringPriority:
              data.prediction?.monitoringPriority,
          }),
        };

        sendFcmRiskAlert(directRiskAlert);
      }
    } catch (error) {
      console.error("Risk prediction error:", error);

      setPredictionError(
        "Unable to connect to the risk prediction engine. Make sure the backend is running."
      );

      setRiskResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRiskClass = (riskLevel) => {
    if (!riskLevel) {
      return "";
    }

    return riskLevel.toLowerCase();
  };

  const getTrendClass = (trendStatus) => {
    if (!trendStatus) {
      return "";
    }

    return trendStatus.toLowerCase();
  };

  const getPriorityClass = (priority) => {
    if (!priority) {
      return "";
    }

    return priority.toLowerCase();
  };

  const getOverallWarning = (data) => {
    if (!data?.regions?.length) {
      return {
        level: "Normal Monitoring",
        className: "low",
        message:
          "No regional warning data is currently available.",
      };
    }

    const hasCritical = data.regions.some(
      (region) =>
        region.riskLevel === "Critical" ||
        region.monitoringPriority === "Immediate"
    );

    const hasHigh = data.regions.some(
      (region) =>
        region.riskLevel === "High" ||
        region.monitoringPriority === "High"
    );

    const hasModerate = data.regions.some(
      (region) => region.riskLevel === "Moderate"
    );

    if (hasCritical) {
      return {
        level: "Critical Warning",
        className: "critical",
        message:
          "One or more NER regions require immediate attention and response preparedness.",
      };
    }

    if (hasHigh) {
      return {
        level: "High Alert",
        className: "high",
        message:
          "High-risk regional conditions detected; monitoring frequency should be increased.",
      };
    }

    if (hasModerate) {
      return {
        level: "Enhanced Monitoring",
        className: "moderate",
        message:
          "Moderate-risk conditions detected; continue enhanced environmental monitoring.",
      };
    }

    return {
      level: "Normal Monitoring",
      className: "low",
      message:
        "No elevated regional warning is currently active.",
    };
  };

  const getWarningAction = (region) => {
    if (!region) {
      return "Continue routine monitoring.";
    }

    if (
      region.monitoringPriority === "Immediate" ||
      region.riskLevel === "Critical"
    ) {
      return "Immediate field assessment and emergency response preparedness are recommended.";
    }

    if (
      region.monitoringPriority === "High" ||
      region.riskLevel === "High"
    ) {
      return "Increase monitoring frequency and maintain early-warning preparedness.";
    }

    if (region.riskLevel === "Moderate") {
      return "Continue enhanced monitoring of rainfall and terrain conditions.";
    }

    return "Continue routine monitoring under current conditions.";
  };

  const warningRegions =
    regionalData?.regions?.filter(
      (region) =>
        region.riskLevel === "Critical" ||
        region.riskLevel === "High"
    ) || [];

  const overallWarning = getOverallWarning(regionalData);

  const warningPriorityRegions = [...warningRegions].sort(
    (a, b) =>
      Number(b.riskScore || 0) -
      Number(a.riskScore || 0)
  );

  const primaryWarningRegion =
    warningPriorityRegions[0] || null;

  const getWarningHeadline = () => {
    if (!primaryWarningRegion) {
      return "NO ACTIVE REGIONAL WARNING";
    }

    if (
      primaryWarningRegion.riskLevel === "Critical"
    ) {
      return `CRITICAL WARNING — ${primaryWarningRegion.location}`;
    }

    return `ELEVATED WARNING — ${primaryWarningRegion.location}`;
  };

  const trendRegions = [
    ...(regionalData?.regions || []),
  ].sort(
    (a, b) =>
      Number(b.riskScore || 0) -
      Number(a.riskScore || 0)
  );

  const trendCounts = {
    increasing: trendRegions.filter(
      (region) =>
        region.trend?.status === "Increasing"
    ).length,

    elevated: trendRegions.filter(
      (region) =>
        region.trend?.status === "Elevated"
    ).length,

    stable: trendRegions.filter(
      (region) =>
        region.trend?.status === "Stable"
    ).length,
  };

  const highestTrendRegion =
    trendRegions[0] || null;

  const lowestTrendRegion =
    trendRegions.length > 0
      ? trendRegions[trendRegions.length - 1]
      : null;

  const temporalRegions = regionalData?.regions || [];

  const temporalWorseningRegions = temporalRegions.filter(
    (region) => region.temporalRisk?.trend?.status === "Worsening"
  );

  const temporalImprovingRegions = temporalRegions.filter(
    (region) => region.temporalRisk?.trend?.status === "Improving"
  );

  const rapidDeteriorationRegions = temporalRegions.filter(
    (region) => region.temporalRisk?.rapidDeterioration === true
  );

  const highestWorseningRegion =
    [...temporalWorseningRegions].sort(
      (a, b) =>
        Number(b.temporalRisk?.riskChange || 0) -
        Number(a.temporalRisk?.riskChange || 0)
    )[0] || null;

  const getTemporalChangeLabel = (region) => {
    const change = region?.temporalRisk?.riskChange;

    if (change === null || change === undefined) {
      return "Baseline";
    }

    return `${change > 0 ? "+" : ""}${change}`;
  };

  const getTemporalChangePercentLabel = (region) => {
    const change = region?.temporalRisk?.riskChangePercent;

    if (change === null || change === undefined) {
      return "Waiting for previous observation";
    }

    return `${change > 0 ? "+" : ""}${change}%`;
  };

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "linear-gradient(135deg, #07111f 0%, #0d1b2a 55%, #102a43 100%)", color: "#fff" }}>
        <div style={{ width: "100%", maxWidth: "430px", padding: "36px", borderRadius: "24px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)", backdropFilter: "blur(18px)" }}>
          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <div style={{ width: "64px", height: "64px", margin: "0 auto 18px", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.12)", fontSize: "30px" }}>◈</div>
            <h1 style={{ margin: 0, fontSize: "32px" }}>GeoPulse</h1>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>AI-Based Early Warning & Landslide Risk Monitoring System</p>
            <span style={{ display: "inline-block", marginTop: "14px", padding: "6px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.78)", fontSize: "12px", fontWeight: 700 }}>SIH 26001 • NER DISASTER MONITORING</span>
          </div>
          <form onSubmit={handleLogin}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 700 }}>Username</label>
            <input type="text" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} placeholder="Enter username" autoComplete="username" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", marginBottom: "18px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.18)", color: "#fff", outline: "none", fontSize: "15px" }} />
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 700 }}>Password</label>
            <div style={{ position: "relative", marginBottom: "18px" }}>
              <input type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter password" autoComplete="current-password" style={{ width: "100%", boxSizing: "border-box", padding: "13px 72px 13px 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.18)", color: "#fff", outline: "none", fontSize: "15px" }} />
              <button type="button" onClick={() => setShowLoginPassword((value) => !value)} style={{ position: "absolute", right: "8px", top: "7px", padding: "7px 9px", border: "none", borderRadius: "8px", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>{showLoginPassword ? "HIDE" : "SHOW"}</button>
            </div>
            {loginError && <div style={{ marginBottom: "16px", padding: "11px 12px", borderRadius: "10px", background: "rgba(220,38,38,0.16)", border: "1px solid rgba(248,113,113,0.28)", color: "#fecaca", fontSize: "13px" }}>{loginError}</div>}
            <button type="submit" style={{ width: "100%", padding: "14px", border: "none", borderRadius: "12px", background: "#fff", color: "#07111f", cursor: "pointer", fontSize: "15px", fontWeight: 800 }}>LOGIN TO GEOPULSE</button>
          </form>
          <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.10)", textAlign: "center", color: "rgba(255,255,255,0.48)", fontSize: "11px" }}>Prototype screening access • Authorized monitoring personnel</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-section">
          <div className="brand-icon">⛰</div>

          <div>
            <h1>LandslideGuard</h1>
            <p>
              AI-Based Landslide Risk Monitoring System
            </p>
          </div>
        </div>

        <div className="system-status">
          <span
            className={`status-dot ${
              backendStatus === "Online"
                ? "online"
                : ""
            }`}
          ></span>

          <div>
            <span className="status-label">
              SYSTEM STATUS
            </span>

            <strong>{backendStatus}</strong>
          </div>
        </div>
      
          <button
            type="button"
            onClick={handleLogout}
            style={{
              marginLeft: "14px",
              padding: "8px 12px",
              borderRadius: "9px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "12px",
            }}
          >
            Logout
          </button>
</header>

      <main className="dashboard">
        <section className="hero-section">
          <div>
            <span className="section-tag">
              SIH 26001
            </span>

            <h2>
              North Eastern Region
              <br />
              Landslide Risk Monitoring
            </h2>

            <p>
              Monitor environmental and terrain
              conditions to assess landslide risk and
              support early warning decisions.
            </p>
          </div>

          <div className="hero-status-card">
            <span>CURRENT RISK</span>

            <strong>
              {riskResult
                ? riskResult.riskScore
                : "--"}
            </strong>

            <small>
              {riskResult
                ? `${riskResult.riskLevel} Risk`
                : "Awaiting analysis"}
            </small>
          </div>
        </section>

        <section className="panel regional-monitoring-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">
                D3
              </span>

              <h3>Regional Monitoring</h3>
            </div>

            <button
              className="regional-refresh-button"
              onClick={fetchRegionalMonitoring}
              disabled={isLoadingRegionalData}
            >
              {isLoadingRegionalData
                ? "UPDATING..."
                : "REFRESH DATA"}
            </button>
          </div>

          <div className="regional-live-status">
            <span className="live-status-indicator"></span>
            <span>LIVE MONITORING</span>

            <small>
              {lastUpdated
                ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                : "Waiting for first monitoring cycle"}
            </small>
          </div>

          {regionalError && (
            <p className="prediction-error">
              {regionalError}
            </p>
          )}

          {isLoadingRegionalData &&
            !regionalData && (
              <div className="regional-loading">
                <strong>
                  Loading regional monitoring data...
                </strong>

                <p>
                  Connecting to the SIH 26001
                  regional monitoring engine.
                </p>
              </div>
            )}

          {regionalData && (
            <>
              <div className="regional-data-source">
                <span>DATA SOURCE</span>

                <strong>
                  Prototype Environmental Monitoring
                </strong>

                <small>
                  Simulated prototype inputs • Live
                  data: No
                </small>
              </div>

              <div className="regional-summary-grid">
                <div className="regional-summary-card">
                  <span>REGIONS MONITORED</span>
                  <strong>
                    {regionalData.summary.totalRegions}
                  </strong>
                  <small>Northeast Region</small>
                </div>

                <div className="regional-summary-card critical">
                  <span>CRITICAL</span>
                  <strong>
                    {regionalData.summary.criticalRegions}
                  </strong>
                  <small>
                    Immediate attention
                  </small>
                </div>

                <div className="regional-summary-card high">
                  <span>HIGH RISK</span>
                  <strong>
                    {regionalData.summary.highRiskRegions}
                  </strong>
                  <small>
                    Increased monitoring
                  </small>
                </div>

                <div className="regional-summary-card moderate">
                  <span>MODERATE</span>
                  <strong>
                    {regionalData.summary.moderateRiskRegions}
                  </strong>
                  <small>
                    Enhanced monitoring
                  </small>
                </div>

                <div className="regional-summary-card low">
                  <span>LOW</span>
                  <strong>
                    {regionalData.summary.lowRiskRegions}
                  </strong>
                  <small>
                    Routine monitoring
                  </small>
                </div>
              </div>

              {regionalData.highestRiskRegion && (
                <div className="highest-risk-card">
                  <div>
                    <span>
                      HIGHEST RISK REGION
                    </span>

                    <h4>
                      {
                        regionalData
                          .highestRiskRegion.location
                      }
                    </h4>

                    <p>
                      Highest calculated regional
                      risk in the current prototype
                      monitoring cycle.
                    </p>
                  </div>

                  <div className="highest-risk-score">
                    <strong>
                      {
                        regionalData
                          .highestRiskRegion.riskScore
                      }
                    </strong>

                    <span>/ 100</span>

                    <small>
                      {
                        regionalData
                          .highestRiskRegion.riskLevel
                      }{" "}
                      •{" "}
                      {
                        regionalData
                          .highestRiskRegion
                          .monitoringPriority
                      }
                    </small>
                  </div>
                </div>
              )}

              <div className="regional-list-header">
                <div>
                  <span className="panel-kicker">
                    REGIONAL STATUS
                  </span>

                  <h4>NER Risk Overview</h4>
                </div>

                <span>
                  {regionalData.regions.length}{" "}
                  regions
                </span>
              </div>

              <div className="regional-risk-grid">
                {regionalData.regions.map(
                  (region) => (
                    <div
                      className={`regional-risk-card ${getRiskClass(
                        region.riskLevel
                      )}`}
                      key={region.location}
                      onClick={() =>
                        handleRegionSelect(region)
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          handleRegionSelect(region);
                        }
                      }}
                    >
                      <div className="regional-card-top">
                        <div>
                          <span className="regional-location-label">
                            REGION
                          </span>

                          <h4>
                            {region.location}
                          </h4>
                        </div>

                        <div
                          className={`regional-risk-badge ${getRiskClass(
                            region.riskLevel
                          )}`}
                        >
                          {region.riskLevel}
                        </div>
                      </div>

                      <div className="regional-score-row">
                        <div>
                          <span>RISK SCORE</span>

                          <strong>
                            {region.riskScore}
                          </strong>

                          <small>/100</small>
                        </div>

                        <div>
                          <span>PRIORITY</span>

                          <strong>
                            {
                              region.monitoringPriority
                            }
                          </strong>
                        </div>
                      </div>

                      <div className="regional-card-metrics">
                        <div>
                          <span>Rainfall</span>
                          <strong>
                            {
                              region.inputSummary
                                ?.rainfall
                            }{" "}
                            mm
                          </strong>
                        </div>

                        <div>
                          <span>Slope</span>
                          <strong>
                            {
                              region.inputSummary
                                ?.slope
                            }
                            °
                          </strong>
                        </div>

                        <div>
                          <span>Moisture</span>
                          <strong>
                            {
                              region.inputSummary
                                ?.soilMoisture
                            }
                            %
                          </strong>
                        </div>

                        <div>
                          <span>Stability</span>
                          <strong>
                            {
                              region.inputSummary
                                ?.soilStability
                            }
                            %
                          </strong>
                        </div>
                      </div>

                      <div className="regional-card-footer">
                        <span>TREND</span>

                        <strong
                          className={`regional-trend ${getTrendClass(
                            region.trend?.status
                          )}`}
                        >
                          {
                            region.trend?.status ||
                            "Unavailable"
                          }
                        </strong>


                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          marginTop: "10px",
                          paddingTop: "10px",
                          borderTop: "1px solid rgba(255,255,255,0.07)",
                          fontSize: "12px",
                        }}
                      >
                        <span style={{ opacity: 0.68 }}>
                          TEMPORAL MOVEMENT
                        </span>

                        <strong>
                          {region.temporalRisk?.trend?.status ||
                            "Baseline"}{" "}
                          • {getTemporalChangeLabel(region)}
                        </strong>
                      </div>                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </section>

        {regionalData && (
          <section className="panel trend-priority-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  D8
                </span>

                <h3>Real-Time Alert Center</h3>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span className="map-badge">
                  {activeAlerts.length > 0
                    ? `${activeAlerts.length} ACTIVE ALERT${activeAlerts.length > 1 ? "S" : ""}`
                    : "NO NEW ALERTS"}
                </span>

                {notificationStatus !== "granted" && (
                  <button
                    type="button"
                    className="regional-refresh-button"
                    onClick={requestBrowserNotifications}
                  >
                    ENABLE ALERTS
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                padding: "14px 16px",
                marginBottom: "16px",
                borderRadius: "12px",
                border:
                  activeAlerts.length > 0
                    ? "1px solid rgba(239,68,68,0.32)"
                    : "1px solid rgba(34,197,94,0.22)",
                background:
                  activeAlerts.length > 0
                    ? "rgba(239,68,68,0.07)"
                    : "rgba(34,197,94,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <span className="decision-label">
                    AUTOMATED REGIONAL ALERTING
                  </span>
                  <strong
                    style={{
                      display: "block",
                      marginTop: "6px",
                      fontSize: "18px",
                    }}
                  >
                    {activeAlerts.length > 0
                      ? "High-risk conditions detected"
                      : "Continuous threshold monitoring active"}
                  </strong>
                </div>

                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    opacity: 0.72,
                  }}
                >
                  BROWSER:{" "}
                  {notificationStatus === "granted"
                    ? "ENABLED"
                    : notificationStatus === "denied"
                    ? "BLOCKED"
                    : notificationStatus === "unsupported"
                    ? "UNSUPPORTED"
                    : "NOT ENABLED"}
                </span>
              </div>

              <p style={{ marginBottom: 0, marginTop: "7px", lineHeight: 1.6 }}>
                The system checks every regional monitoring cycle and creates
                an alert when a region enters a High or Critical risk state.
                Repeated refreshes do not create duplicate alerts while the
                region remains at the same elevated level.
              </p>
            </div>

            {activeAlerts.length > 0 ? (
              <div className="risk-factors">
                {activeAlerts.map((alert) => (
                  <div
                    className="risk-factor"
                    key={alert.id}
                    style={{
                      border:
                        alert.severity === "CRITICAL"
                          ? "1px solid rgba(239,68,68,0.38)"
                          : "1px solid rgba(245,158,11,0.34)",
                      background:
                        alert.severity === "CRITICAL"
                          ? "rgba(239,68,68,0.06)"
                          : "rgba(245,158,11,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <strong>
                          {alert.severity === "CRITICAL" ? "🚨" : "⚠️"}{" "}
                          {alert.region}
                        </strong>
                        <span>
                          {alert.severity} • {alert.riskLevel} • Risk{" "}
                          {alert.riskScore}/100
                        </span>
                      </div>

                      <button
                        type="button"
                        className="regional-refresh-button"
                        onClick={() => dismissAlert(alert.id)}
                      >
                        DISMISS
                      </button>
                    </div>

                    <p>
                      <strong>Alert:</strong> {alert.reason}
                    </p>

                    <p>
                      <strong>Recommended action:</strong> {alert.action}
                    </p>

                    <p style={{ marginBottom: 0, opacity: 0.62 }}>
                      Triggered{" "}
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="risk-factors">
                <p style={{ marginBottom: 0 }}>
                  No new High or Critical threshold-crossing alert has been
                  detected in the current browser session.
                </p>
              </div>
            )}
          </section>
        )}

        {regionalData && (
          <section className="panel trend-priority-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  D3-P5
                </span>

                <h3>Early Warning Center</h3>
              </div>

              <span
                className={`map-badge ${overallWarning.className}`}
              >
                EARLY WARNING
              </span>
            </div>

            <div
              className={`warning-alert-banner ${
                primaryWarningRegion
                  ? primaryWarningRegion.riskLevel.toLowerCase()
                  : "clear"
              }`}
            >
              <div className="warning-alert-icon">
                !
              </div>

              <div className="warning-alert-content">
                <span className="decision-label">
                  OPERATOR ALERT
                </span>

                <strong>
                  {getWarningHeadline()}
                </strong>

                <p>
                  {primaryWarningRegion
                    ? primaryWarningRegion.warning ||
                      "Elevated landslide risk conditions detected."
                    : "No critical or high-risk regional warning is active."}
                </p>
              </div>

              {primaryWarningRegion && (
                <div className="warning-alert-score">
                  <strong>
                    {
                      primaryWarningRegion.riskScore
                    }
                  </strong>

                  <span>/100</span>
                </div>
              )}
            </div>

            <div className="trend-priority-grid">
              <div
                className={`decision-card priority-card ${overallWarning.className}`}
              >
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      REGIONAL WARNING STATUS
                    </span>

                    <strong>
                      {overallWarning.level}
                    </strong>
                  </div>

                  <span className="decision-state">
                    {
                      regionalData.summary
                        .immediatePriorityRegions
                    }{" "}
                    IMMEDIATE
                  </span>
                </div>

                <p>
                  {overallWarning.message}
                </p>
              </div>

              <div
                className={`decision-card trend-card ${
                  warningRegions.length > 0
                    ? "increasing"
                    : "stable"
                }`}
              >
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      ACTIVE WARNING REGIONS
                    </span>

                    <strong>
                      {warningRegions.length}
                    </strong>
                  </div>

                  <span className="decision-state">
                    CRITICAL + HIGH
                  </span>
                </div>

                <p>
                  {warningRegions.length > 0
                    ? `${warningRegions.length} regions currently require elevated monitoring attention.`
                    : "No critical or high-risk regions are currently active."}
                </p>
              </div>
            </div>

            {warningPriorityRegions.length >
              0 && (
              <div className="warning-priority-queue">
                <div className="regional-list-header">
                  <div>
                    <h4>
                      Priority Response Queue
                    </h4>

                    <span>
                      Highest-risk regions first
                    </span>
                  </div>
                </div>

                <div className="warning-queue-list">
                  {warningPriorityRegions
                    .slice(0, 5)
                    .map((region, index) => (
                      <div
                        className={`warning-queue-item ${region.riskLevel.toLowerCase()}`}
                        key={`queue-${region.location}`}
                      >
                        <span className="warning-queue-rank">
                          {index + 1}
                        </span>

                        <div>
                          <strong>
                            {region.location}
                          </strong>

                          <span>
                            {region.riskLevel} •{" "}
                            {
                              region.monitoringPriority
                            }
                          </span>
                        </div>

                        <strong className="warning-queue-score">
                          {region.riskScore}
                        </strong>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="risk-factors">
              {warningRegions.length > 0 ? (
                warningRegions.map((region) => (
                  <div
                    className="risk-factor"
                    key={`warning-${region.location}`}
                  >
                    <div>
                      <strong>
                        {region.location}
                      </strong>

                      <span>
                        {region.riskLevel} •{" "}
                        {region.monitoringPriority} •
                        Score {region.riskScore}/100
                      </span>
                    </div>

                    <p>
                      <strong>Warning:</strong>{" "}
                      {region.warning ||
                        "Elevated landslide risk conditions detected."}
                    </p>

                    <p>
                      <strong>
                        Environmental triggers:
                      </strong>{" "}
                      Rainfall{" "}
                      {region.inputSummary?.rainfall}{" "}
                      mm • Slope{" "}
                      {region.inputSummary?.slope}°
                      • Soil moisture{" "}
                      {region.inputSummary
                        ?.soilMoisture}
                      % • Soil stability{" "}
                      {region.inputSummary
                        ?.soilStability}
                      %
                    </p>

                    <p>
                      <strong>
                        Recommended action:
                      </strong>{" "}
                      {getWarningAction(region)}
                    </p>
                  </div>
                ))
              ) : (
                <p>
                  No active critical or high-risk
                  regional warnings detected.
                  Continue routine monitoring across
                  the NER.
                </p>
              )}
            </div>
          </section>
        )}

        {regionalData && (
          <section className="panel trend-priority-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  D3-P6
                </span>

                <h3>
                  Temporal Risk Visualization
                </h3>
              </div>

              <span className="map-badge">
                TEMPORAL MONITORING
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              <div className="decision-card">
                <span className="decision-label">
                  TEMPORAL WORSENING
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {regionalData.summary?.temporalWorseningRegions ??
                    temporalWorseningRegions.length}
                </strong>
                <p style={{ marginBottom: 0 }}>
                  Regions whose latest recorded risk increased versus
                  the previous observation.
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  TEMPORAL IMPROVING
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {regionalData.summary?.temporalImprovingRegions ??
                    temporalImprovingRegions.length}
                </strong>
                <p style={{ marginBottom: 0 }}>
                  Regions whose latest recorded risk decreased versus
                  the previous observation.
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  RAPID DETERIORATION
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {regionalData.summary?.rapidDeteriorationRegions ??
                    rapidDeteriorationRegions.length}
                </strong>
                <p style={{ marginBottom: 0 }}>
                  Regions crossing the temporal rapid-deterioration
                  threshold.
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  OBSERVATION INTERVAL
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "20px",
                  }}
                >
                  {regionalData.temporalMonitoring?.observationInterval ||
                    "5 minutes"}
                </strong>
                <p style={{ marginBottom: 0 }}>
                  Regional observations are rate-limited to prevent
                  artificial history from dashboard refreshes.
                </p>
              </div>
            </div>

            {highestWorseningRegion && (
              <div
                style={{
                  marginBottom: "18px",
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(245,158,11,0.28)",
                  background: "rgba(245,158,11,0.06)",
                }}
              >
                <span className="decision-label">
                  HIGHEST TEMPORAL ESCALATION
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "6px",
                    fontSize: "18px",
                  }}
                >
                  {highestWorseningRegion.location} •{" "}
                  {getTemporalChangeLabel(highestWorseningRegion)} risk
                </strong>
                <p style={{ marginBottom: 0, marginTop: "6px" }}>
                  {getTemporalChangePercentLabel(highestWorseningRegion)}
                  {" • "}
                  {highestWorseningRegion.temporalRisk?.escalation ||
                    "Moderate"}{" "}
                  escalation.
                </p>
              </div>
            )}

            <div className="trend-priority-grid">
              <div className="decision-card trend-card increasing">
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      INCREASING RISK
                    </span>

                    <strong>
                      {trendCounts.increasing}
                    </strong>
                  </div>

                  <span className="decision-state">
                    REGIONS
                  </span>
                </div>

                <p>
                  Regions where the current
                  environmental conditions indicate
                  increasing risk.
                </p>
              </div>

              <div className="decision-card trend-card increasing">
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      ELEVATED RISK
                    </span>

                    <strong>
                      {trendCounts.elevated}
                    </strong>
                  </div>

                  <span className="decision-state">
                    REGIONS
                  </span>
                </div>

                <p>
                  Regions showing elevated
                  current-condition severity requiring
                  closer monitoring.
                </p>
              </div>

              <div className="decision-card trend-card stable">
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      STABLE RISK
                    </span>

                    <strong>
                      {trendCounts.stable}
                    </strong>
                  </div>

                  <span className="decision-state">
                    REGIONS
                  </span>
                </div>

                <p>
                  Regions currently assessed without
                  an elevated trend signal.
                </p>
              </div>
            </div>

            <div className="risk-factors">
              {trendRegions.map((region) => {
                const score = Number(
                  region.riskScore || 0
                );

                const barWidth = Math.max(
                  4,
                  Math.min(100, score)
                );

                const trendStatus =
                  region.trend?.status ||
                  "Unavailable";

                return (
                  <div
                    className="risk-factor"
                    key={`trend-${region.location}`}
                  >
                    <div>
                      <strong>
                        {region.location}
                      </strong>

                      <span>
                        {trendStatus} •{" "}
                        {region.riskLevel} • Score{" "}
                        {score}/100
                      </span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: "10px",
                        marginTop: "12px",
                        borderRadius: "999px",
                        background:
                          "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          height: "100%",
                          borderRadius: "999px",
                          background:
                            trendStatus ===
                            "Increasing"
                              ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                              : trendStatus ===
                                "Elevated"
                              ? "linear-gradient(90deg, #eab308, #f59e0b)"
                              : "linear-gradient(90deg, #22c55e, #14b8a6)",
                          transition:
                            "width 0.4s ease",
                        }}
                      />
                    </div>

                    <p>
                      {region.trend?.reason ||
                        "Current-condition trend information is unavailable."}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="data-summary">
              <div>
                <span>HIGHEST RISK</span>

                <strong>
                  {highestTrendRegion
                    ? `${highestTrendRegion.location} • ${highestTrendRegion.riskScore}`
                    : "N/A"}
                </strong>
              </div>

              <div>
                <span>LOWEST RISK</span>

                <strong>
                  {lowestTrendRegion
                    ? `${lowestTrendRegion.location} • ${lowestTrendRegion.riskScore}`
                    : "N/A"}
                </strong>
              </div>

              <div>
                <span>REGIONS ANALYZED</span>

                <strong>
                  {trendRegions.length}
                </strong>
              </div>
            </div>

            <p
              style={{
                marginTop: "18px",
                opacity: 0.72,
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              Visualization note: D3-P6 now surfaces
              temporal movement from the regional monitoring
              engine. Worsening and improving states compare
              the latest recorded regional risk with the
              previous observation. This is an in-memory
              prototype observation stream, not persistent
              historical sensor data or a long-range forecast.
            </p>
          </section>
        )}

        <section className="map-section panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">
                D5 + D8
              </span>

              <h3>Interactive Regional Risk Map</h3>
            </div>

            <span className="map-badge">
              LIVE GIS • NER
            </span>
          </div>

          <RiskMap
            regionalData={regionalData}
            selectedRegion={selectedRegion}
            onRegionSelect={handleRegionSelect}
          />

          {selectedRegion && (
            <div className="selected-region-panel">
              <div className="selected-region-header">
                <div>
                  <span className="panel-kicker">
                    SELECTED REGION
                  </span>

                  <h4>
                    {selectedRegion.location}
                  </h4>
                </div>

                <div
                  className={`regional-risk-badge ${getRiskClass(
                    selectedRegion.riskLevel
                  )}`}
                >
                  {selectedRegion.riskLevel}
                </div>
              </div>

              <div className="selected-region-grid">
                <div>
                  <span>RISK SCORE</span>
                  <strong>
                    {selectedRegion.riskScore}/100
                  </strong>
                </div>

                <div>
                  <span>PRIORITY</span>
                  <strong>
                    {
                      selectedRegion.monitoringPriority
                    }
                  </strong>
                </div>

                <div>
                  <span>TREND</span>
                  <strong>
                    {
                      selectedRegion.trend?.status ||
                      "N/A"
                    }
                  </strong>
                </div>

                <div>
                  <span>RAINFALL</span>
                  <strong>
                    {
                      selectedRegion.inputSummary
                        ?.rainfall
                    }{" "}
                    mm
                  </strong>
                </div>

                <div>
                  <span>SLOPE</span>
                  <strong>
                    {
                      selectedRegion.inputSummary
                        ?.slope
                    }
                    °
                  </strong>
                </div>

                <div>
                  <span>SOIL MOISTURE</span>
                  <strong>
                    {
                      selectedRegion.inputSummary
                        ?.soilMoisture
                    }
                    %
                  </strong>
                </div>

                <div>
                  <span>SOIL STABILITY</span>
                  <strong>
                    {
                      selectedRegion.inputSummary
                        ?.soilStability
                    }
                    %
                  </strong>
                </div>
              </div>

              {selectedRegion.warning && (
                <div className="selected-region-warning">
                  <span>EARLY WARNING</span>

                  <p>
                    {selectedRegion.warning}
                  </p>
                </div>
              )}

              {selectedRegion.trend?.reason && (
                <div className="selected-region-trend">
                  <span>RISK TREND INTELLIGENCE</span>

                  <p>
                    {
                      selectedRegion.trend.reason
                    }
                  </p>
                </div>
              )}
              {selectedRegion.temporalRisk && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <span className="panel-kicker">
                        D8
                      </span>
                      <strong
                        style={{
                          display: "block",
                          marginTop: "4px",
                          fontSize: "17px",
                        }}
                      >
                        Regional Temporal Intelligence
                      </strong>
                    </div>

                    <span
                      className={`regional-risk-badge ${getTrendClass(
                        selectedRegion.temporalRisk.trend?.status
                      )}`}
                    >
                      {selectedRegion.temporalRisk.trend?.status ||
                        "Baseline"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: "10px",
                      marginTop: "14px",
                    }}
                  >
                    <div className="data-summary">
                      <div>
                        <span>PREVIOUS</span>
                        <strong>
                          {selectedRegion.temporalRisk.previousRiskScore ===
                            null ||
                          selectedRegion.temporalRisk.previousRiskScore ===
                            undefined
                            ? "N/A"
                            : `${selectedRegion.temporalRisk.previousRiskScore}/100`}
                        </strong>
                      </div>
                    </div>

                    <div className="data-summary">
                      <div>
                        <span>CURRENT</span>
                        <strong>
                          {selectedRegion.temporalRisk.currentRiskScore}/100
                        </strong>
                      </div>
                    </div>

                    <div className="data-summary">
                      <div>
                        <span>CHANGE</span>
                        <strong>
                          {getTemporalChangeLabel(selectedRegion)}
                        </strong>
                      </div>
                    </div>

                    <div className="data-summary">
                      <div>
                        <span>CHANGE %</span>
                        <strong>
                          {getTemporalChangePercentLabel(selectedRegion)}
                        </strong>
                      </div>
                    </div>

                    <div className="data-summary">
                      <div>
                        <span>ESCALATION</span>
                        <strong>
                          {selectedRegion.temporalRisk.escalation ||
                            "N/A"}
                        </strong>
                      </div>
                    </div>

                    <div className="data-summary">
                      <div>
                        <span>RAPID DETERIORATION</span>
                        <strong>
                          {selectedRegion.temporalRisk.rapidDeterioration
                            ? "YES"
                            : "NO"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px 14px",
                      borderRadius: "9px",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span className="decision-label">
                      TEMPORAL DECISION SUPPORT
                    </span>

                    <p
                      style={{
                        margin: "6px 0 0",
                        lineHeight: 1.6,
                      }}
                    >
                      {selectedRegion.temporalRisk.recommendation?.message ||
                        "Baseline established. A previous observation is required for temporal comparison."}
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}

          {!selectedRegion && regionalData && (
            <div className="map-selection-hint">
              <strong>
                Select a region on the map
              </strong>

              <span>
                Click any NER risk marker to inspect
                its current environmental and warning
                intelligence.
              </span>
            </div>
          )}
        </section>

        <section className="dashboard-grid">
          <div className="control-panel panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  01
                </span>

                <h3>Location & Conditions</h3>
              </div>

              <span className="input-badge">
                INPUT
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="location">
                Monitoring Location
              </label>

              <select
                id="location"
                value={parameters.location}
                onChange={handleLocationChange}
              >
                {NER_LOCATIONS.map((location) => (
                  <option
                    key={location}
                    value={location}
                  >
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div className="parameter-list">
              <div className="parameter-row">
                <div className="parameter-heading">
                  <label htmlFor="rainfall">
                    Rainfall
                  </label>

                  <span>
                    {parameters.rainfall}
                    {RISK_INPUT_LIMITS.rainfall.unit}
                  </span>
                </div>

                <input
                  id="rainfall"
                  name="rainfall"
                  type="range"
                  min={RISK_INPUT_LIMITS.rainfall.min}
                  max={RISK_INPUT_LIMITS.rainfall.max}
                  value={parameters.rainfall}
                  onChange={handleParameterChange}
                />
              </div>

              <div className="parameter-row">
                <div className="parameter-heading">
                  <label htmlFor="slope">
                    Slope
                  </label>

                  <span>
                    {parameters.slope}
                    {RISK_INPUT_LIMITS.slope.unit ===
                    "degrees"
                      ? "°"
                      : ""}
                  </span>
                </div>

                <input
                  id="slope"
                  name="slope"
                  type="range"
                  min={RISK_INPUT_LIMITS.slope.min}
                  max={RISK_INPUT_LIMITS.slope.max}
                  value={parameters.slope}
                  onChange={handleParameterChange}
                />
              </div>

              <div className="parameter-row">
                <div className="parameter-heading">
                  <label htmlFor="soilMoisture">
                    Soil Moisture
                  </label>

                  <span>
                    {parameters.soilMoisture}{" "}
                    {
                      RISK_INPUT_LIMITS.soilMoisture
                        .unit
                    }
                  </span>
                </div>

                <input
                  id="soilMoisture"
                  name="soilMoisture"
                  type="range"
                  min={
                    RISK_INPUT_LIMITS.soilMoisture.min
                  }
                  max={
                    RISK_INPUT_LIMITS.soilMoisture.max
                  }
                  value={parameters.soilMoisture}
                  onChange={handleParameterChange}
                />
              </div>

              <div className="parameter-row">
                <div className="parameter-heading">
                  <label htmlFor="soilStability">
                    Soil Stability
                  </label>

                  <span>
                    {parameters.soilStability}{" "}
                    {
                      RISK_INPUT_LIMITS.soilStability
                        .unit
                    }
                  </span>
                </div>

                <input
                  id="soilStability"
                  name="soilStability"
                  type="range"
                  min={
                    RISK_INPUT_LIMITS.soilStability.min
                  }
                  max={
                    RISK_INPUT_LIMITS.soilStability.max
                  }
                  value={parameters.soilStability}
                  onChange={handleParameterChange}
                />
              </div>
            </div>

            <button
              className="analyze-button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? "ANALYZING..."
                : "ANALYZE RISK"}

              <span>→</span>
            </button>

            {predictionError && (
              <p className="prediction-error">
                {predictionError}
              </p>
            )}

            <div
              style={{
                marginTop: "18px",
                padding: "14px 16px",
                borderRadius: "12px",
                border:
                  scenarioMode === "what-if"
                    ? "1px solid rgba(59, 130, 246, 0.28)"
                    : "1px solid rgba(34, 197, 94, 0.22)",
                background:
                  scenarioMode === "what-if"
                    ? "rgba(59, 130, 246, 0.06)"
                    : "rgba(34, 197, 94, 0.045)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <span
                  className="decision-label"
                  style={{
                    color:
                      scenarioMode === "what-if"
                        ? "#3b82f6"
                        : "#22c55e",
                  }}
                >
                  {scenarioMode === "what-if"
                    ? "MANUAL WHAT-IF SCENARIO"
                    : "REGIONAL BASELINE SCENARIO"}
                </span>

                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    opacity: 0.6,
                  }}
                >
                  {parameters.location}
                </span>
              </div>

              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  opacity: 0.76,
                }}
              >
                {scenarioMode === "what-if"
                  ? "One or more environmental inputs differ from the regional baseline. Analyze Risk to evaluate the changed scenario."
                  : "Current environmental inputs match the selected region's loaded baseline conditions."}
              </p>

              {scenarioMode === "what-if" &&
                getScenarioDifferences().length > 0 && (
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "7px",
                    }}
                  >
                    {getScenarioDifferences().map((difference) => (
                      <span
                        key={difference.key}
                        style={{
                          fontSize: "11px",
                          padding: "5px 8px",
                          borderRadius: "7px",
                          background: "rgba(255,255,255,0.045)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          opacity: 0.82,
                        }}
                      >
                        {difference.label}: {difference.baseline}
                        {difference.unit} → {difference.current}
                        {difference.unit}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {riskResult?.scenarioType === "what-if" &&
            riskResult?.baselineReference &&
            riskResult.baselineReference.location ===
              riskResult.analyzedLocation && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(245, 158, 11, 0.24)",
                  background: "rgba(245, 158, 11, 0.045)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="decision-label"
                    style={{ color: "#f59e0b" }}
                  >
                    BASELINE vs WHAT-IF
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      opacity: 0.62,
                    }}
                  >
                    {riskResult.analyzedLocation}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "10px",
                    marginTop: "12px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "block",
                        fontSize: "11px",
                        opacity: 0.58,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Baseline Risk
                    </span>
                    <strong style={{ fontSize: "18px" }}>
                      {riskResult.baselineReference.riskScore}
                    </strong>
                  </div>

                  <div>
                    <span
                      style={{
                        display: "block",
                        fontSize: "11px",
                        opacity: 0.58,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      What-If Risk
                    </span>
                    <strong style={{ fontSize: "18px" }}>
                      {riskResult.riskScore}
                    </strong>
                  </div>

                  <div>
                    <span
                      style={{
                        display: "block",
                        fontSize: "11px",
                        opacity: 0.58,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Risk Change
                    </span>
                    <strong
                      style={{
                        fontSize: "18px",
                        color:
                          Number(riskResult.riskScore || 0) -
                            Number(riskResult.baselineReference.riskScore || 0) >=
                          0
                            ? "#f59e0b"
                            : "#22c55e",
                      }}
                    >
                      {Number(riskResult.riskScore || 0) -
                        Number(riskResult.baselineReference.riskScore || 0) >=
                      0
                        ? "+"
                        : ""}
                      {Number(riskResult.riskScore || 0) -
                        Number(riskResult.baselineReference.riskScore || 0)}
                    </strong>
                  </div>
                </div>

                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    opacity: 0.72,
                  }}
                >
                  The current what-if scenario is compared with the
                  previously analyzed regional baseline to support
                  decision-making under changed environmental conditions.
                </p>
              </div>
            )}

          <div className="risk-panel panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  02
                </span>

                <h3>Risk Assessment</h3>

                {riskResult?.analyzedLocation && (
                  <>
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "13px",
                        fontWeight: 600,
                        opacity: 0.68,
                        letterSpacing: "0.02em",
                      }}
                    >
                      ANALYZED REGION • {riskResult.analyzedLocation}
                    </div>

                    {riskResult?.scenarioType && (
                      <div
                        style={{
                          marginTop: "5px",
                          fontSize: "12px",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color:
                            riskResult.scenarioType === "what-if"
                              ? "#3b82f6"
                              : "#22c55e",
                        }}
                      >
                        {riskResult.scenarioType === "what-if"
                          ? "SCENARIO • MANUAL WHAT-IF"
                          : "SCENARIO • REGIONAL BASELINE"}
                      </div>
                    )}
                  </>
                )}
              </div>

              <span className="waiting-badge">
                {riskResult
                  ? "ENGINE ACTIVE"
                  : "READY"}
              </span>
            </div>

            <div className="risk-placeholder">
              <div
                className={`risk-circle ${
                  riskResult
                    ? getRiskClass(
                        riskResult.riskLevel
                      )
                    : ""
                }`}
              >
                <span>
                  {riskResult
                    ? riskResult.riskScore
                    : "--"}
                </span>

                <small>/ 100</small>
              </div>

              <h4>
                {riskResult
                  ? `${riskResult.riskLevel} Risk`
                  : "Risk Score"}
              </h4>

              {riskResult?.analyzedLocation && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "2px auto 10px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(59, 130, 246, 0.24)",
                    background: "rgba(59, 130, 246, 0.08)",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  {riskResult.analyzedLocation}
                </div>
              )}

              <p>
                {riskResult
                  ? riskResult.warning
                  : "Adjust the environmental parameters and click Analyze Risk to calculate the current landslide risk."}
              </p>
            </div>

            <div className="risk-levels">
              <div>
                <span className="level-indicator low"></span>
                <span>Low</span>
              </div>

              <div>
                <span className="level-indicator moderate"></span>
                <span>Moderate</span>
              </div>

              <div>
                <span className="level-indicator high"></span>
                <span>High</span>
              </div>

              <div>
                <span className="level-indicator critical"></span>
                <span>Critical</span>
              </div>
            </div>
          </div>
        </section>

        {riskResult && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  04
                </span>

                <h3>Risk Factors</h3>
              </div>

              <span className="map-badge">
                AI EXPLANATION
              </span>
            </div>

            <div className="risk-factors">
              {riskResult.factors?.length > 0 ? (
                riskResult.factors.map(
                  (factor, index) => (
                    <div
                      className="risk-factor"
                      key={`${factor.parameter}-${index}`}
                    >
                      <div>
                        <strong>
                          {factor.parameter}
                        </strong>

                        <span>
                          Value: {factor.value} •
                          Impact: {factor.impact}
                        </span>
                      </div>

                      <p>{factor.message}</p>
                    </div>
                  )
                )
              ) : (
                <p>
                  No significant contributing factors
                  detected for the current conditions.
                </p>
              )}
            </div>
          </section>
        )}

        {riskResult?.temporalRisk && (
          <section className="panel trend-priority-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  D6
                </span>

                <h3>
                  Temporal Risk Intelligence
                </h3>
              </div>

              <span className="map-badge">
                TEMPORAL ANALYSIS
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <div
                className="decision-card"
                style={{
                  borderTop:
                    "3px solid currentColor",
                }}
              >
                <span className="decision-label">
                  TEMPORAL TREND
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {riskResult.temporalRisk.trend?.status ||
                    riskResult.temporalRisk.status ||
                    "Unavailable"}
                </strong>

                <p style={{ marginBottom: 0 }}>
                  {riskResult.temporalRisk.trend?.explanation ||
                    "Temporal trend information is unavailable."}
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  RISK MOVEMENT
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {riskResult.temporalRisk.riskChange === null ||
                  riskResult.temporalRisk.riskChange === undefined
                    ? "N/A"
                    : `${riskResult.temporalRisk.riskChange > 0 ? "+" : ""}${riskResult.temporalRisk.riskChange}`}
                </strong>

                <p style={{ marginBottom: 0 }}>
                  {riskResult.temporalRisk.riskChangePercent === null ||
                  riskResult.temporalRisk.riskChangePercent === undefined
                    ? "Waiting for a previous observation."
                    : `${riskResult.temporalRisk.riskChangePercent > 0 ? "+" : ""}${riskResult.temporalRisk.riskChangePercent}% versus previous risk.`}
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  ESCALATION
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {riskResult.temporalRisk.escalation || "N/A"}
                </strong>

                <p style={{ marginBottom: 0 }}>
                  Change severity based on temporal risk movement.
                </p>
              </div>

              <div className="decision-card">
                <span className="decision-label">
                  RAPID DETERIORATION
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "8px",
                    fontSize: "24px",
                  }}
                >
                  {riskResult.temporalRisk.rapidDeterioration
                    ? "YES"
                    : "NO"}
                </strong>

                <p style={{ marginBottom: 0 }}>
                  {riskResult.temporalRisk.rapidDeterioration
                    ? "Rapid upward risk movement detected."
                    : "No rapid upward deterioration detected."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              <div className="data-summary">
                <div>
                  <span>PREVIOUS RISK</span>
                  <strong>
                    {riskResult.temporalRisk.previousRiskScore === null ||
                    riskResult.temporalRisk.previousRiskScore === undefined
                      ? "N/A"
                      : `${riskResult.temporalRisk.previousRiskScore}/100`}
                  </strong>
                </div>
              </div>

              <div className="data-summary">
                <div>
                  <span>CURRENT RISK</span>
                  <strong>
                    {riskResult.temporalRisk.currentRiskScore}/100
                  </strong>
                </div>
              </div>

              <div className="data-summary">
                <div>
                  <span>CHANGE</span>
                  <strong>
                    {riskResult.temporalRisk.riskChange === null ||
                    riskResult.temporalRisk.riskChange === undefined
                      ? "N/A"
                      : `${riskResult.temporalRisk.riskChange > 0 ? "+" : ""}${riskResult.temporalRisk.riskChange}`}
                  </strong>
                </div>
              </div>

              <div className="data-summary">
                <div>
                  <span>RECOMMENDATION</span>
                  <strong>
                    {riskResult.temporalRisk.recommendation?.level ||
                      "N/A"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="risk-factors">
              <div className="risk-factor">
                <div>
                  <strong>
                    Decision Support Recommendation
                  </strong>

                  <span>
                    {riskResult.temporalRisk.recommendation?.level ||
                      "ROUTINE"}{" "}
                    • D6 TEMPORAL INTELLIGENCE
                  </span>
                </div>

                <p>
                  {riskResult.temporalRisk.recommendation?.message ||
                    "No temporal recommendation is currently available."}
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "14px 16px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Temporal Intelligence Status
              </strong>

              <span
                style={{
                  display: "block",
                  opacity: 0.78,
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                {riskResult.temporalRisk.available
                  ? "Previous regional observations are available and the current risk movement has been analyzed."
                  : "Baseline established. Analyze the same region again to calculate temporal risk movement."}
              </span>
            </div>

            <p
              style={{
                marginTop: "16px",
                marginBottom: 0,
                opacity: 0.68,
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              Prototype note: D6 currently uses in-memory observations.
              Historical records reset when the backend restarts and are
              not yet connected to persistent historical sensor data.
            </p>
          </section>
        )}

        {riskResult && (
          <section className="panel trend-priority-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  05
                </span>

                <h3>
                  Risk Trend & Priority
                </h3>
              </div>

              <span className="map-badge">
                DECISION SUPPORT
              </span>
            </div>

            <div className="trend-priority-grid">
              <div
                className={`decision-card trend-card ${getTrendClass(
                  riskResult.trend?.status
                )}`}
              >
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      RISK TREND
                    </span>

                    <strong>
                      {riskResult.trend?.status ||
                        "Unavailable"}
                    </strong>
                  </div>

                  <span className="decision-state">
                    CURRENT-CONDITION ANALYSIS
                  </span>
                </div>

                <p>
                  {riskResult.trend?.reason ||
                    "Trend information is unavailable."}
                </p>
              </div>

              <div
                className={`decision-card priority-card ${getPriorityClass(
                  riskResult.monitoringPriority
                )}`}
              >
                <div className="decision-card-header">
                  <div>
                    <span className="decision-label">
                      MONITORING PRIORITY
                    </span>

                    <strong>
                      {
                        riskResult.monitoringPriority ||
                        "Unavailable"
                      }
                    </strong>
                  </div>

                  <span className="decision-state">
                    RESPONSE PRIORITY
                  </span>
                </div>

                <p>
                  {riskResult.monitoringPriority ===
                  "Immediate"
                    ? "Immediate assessment and emergency response consideration are recommended."
                    : riskResult.monitoringPriority ===
                      "High"
                    ? "Increase monitoring frequency and maintain early warning preparedness."
                    : riskResult.monitoringPriority ===
                      "Medium"
                    ? "Continue enhanced monitoring of environmental and terrain conditions."
                    : "Continue routine monitoring under the current conditions."}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="bottom-grid">
          <div className="warning-card panel">
            <div className="warning-icon">
              !
            </div>

            <div>
              <span className="panel-kicker">
                EARLY WARNING
              </span>

              <h3>
                {riskResult
                  ? riskResult.riskLevel ===
                      "Critical" ||
                    riskResult.riskLevel === "High"
                    ? "Active warning"
                    : "No active warning"
                  : "Awaiting risk analysis"}
              </h3>

              <p>
                {riskResult
                  ? riskResult.warning
                  : "Warning generation will be based on the calculated risk level."}
              </p>
            </div>
          </div>

          <div className="data-card panel">
            <span className="panel-kicker">
              CURRENT INPUT DATA
            </span>

            <div className="data-summary">
              <div>
                <span>Location</span>
                <strong>
                  {parameters.location}
                </strong>
              </div>

              <div>
                <span>Rainfall</span>
                <strong>
                  {parameters.rainfall} mm
                </strong>
              </div>

              <div>
                <span>Slope</span>
                <strong>
                  {parameters.slope}°
                </strong>
              </div>

              <div>
                <span>Moisture</span>
                <strong>
                  {parameters.soilMoisture}%
                </strong>
              </div>

              <div>
                <span>Stability</span>
                <strong>
                  {parameters.soilStability}%
                </strong>
              </div>

              {riskResult && (
                <>
                  <div>
                    <span>Risk Score</span>

                    <strong>
                      {riskResult.riskScore}/100
                    </strong>
                  </div>

                  <div>
                    <span>Trend</span>

                    <strong>
                      {riskResult.trend?.status ||
                        "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Priority</span>

                    <strong>
                      {
                        riskResult.monitoringPriority ||
                        "N/A"
                      }
                    </strong>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>
          SIH 2026 • Problem Statement 26001
        </span>

        <span>
          Prototype — D8 Temporal GIS Risk
          Intelligence
        </span>
      </footer>
    </div>
  );
}

export default App;