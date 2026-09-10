import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { useEffect, useMemo, useState } from "react";

const NER_COORDINATES = {
  Sikkim: [27.533, 88.512],
  "Arunachal Pradesh": [28.218, 94.727],
  Assam: [26.2006, 92.9376],
  Meghalaya: [25.467, 91.366],
  Manipur: [24.6637, 93.9063],
  Mizoram: [23.1645, 92.9376],
  Nagaland: [26.1584, 94.5624],
  Tripura: [23.9408, 91.9882],
};

const RISK_COLORS = {
  Critical: "#ef4444",
  High: "#f97316",
  Moderate: "#eab308",
  Low: "#22c55e",
};

const DEFAULT_COLOR = "#94a3b8";

const FILTERS = [
  "All",
  "Critical",
  "High",
  "Moderate",
  "Low",
];

const getRiskColor = (riskLevel) =>
  RISK_COLORS[riskLevel] || DEFAULT_COLOR;

function MapViewUpdater({ selectedRegion }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedRegion) {
      return;
    }

    const coordinates =
      NER_COORDINATES[selectedRegion.location];

    if (!coordinates) {
      return;
    }

    map.flyTo(coordinates, 7, {
      duration: 0.8,
    });
  }, [map, selectedRegion]);

  return null;
}

function AnimatedRiskMarker({
  region,
  selectedRegion,
  onRegionSelect,
}) {
  const coordinates =
    NER_COORDINATES[region.location];

  if (!coordinates) {
    return null;
  }

  const riskColor = getRiskColor(
    region.riskLevel
  );

  const riskScore = Number(
    region.riskScore || 0
  );

  const isSelected =
    selectedRegion?.location === region.location;

  const radius =
    riskScore >= 80
      ? 17
      : riskScore >= 60
      ? 15
      : riskScore >= 40
      ? 13
      : 11;

  return (
    <CircleMarker
      center={coordinates}
      radius={isSelected ? radius + 3 : radius}
      pathOptions={{
        color: isSelected
          ? "#ffffff"
          : riskColor,
        fillColor: riskColor,
        fillOpacity: 0.82,
        weight: isSelected ? 5 : 3,
      }}
      eventHandlers={{
        click: () => {
          onRegionSelect(region);
        },
      }}
    >
      <Popup>
        <div className="risk-map-popup">
          <div className="popup-header">
            <div>
              <span className="popup-kicker">
                NER MONITORING
              </span>

              <h4>{region.location}</h4>
            </div>

            <span
              className="popup-risk-badge"
              style={{
                borderColor: riskColor,
                color: riskColor,
              }}
            >
              {region.riskLevel}
            </span>
          </div>

          <div className="popup-score">
            <span>RISK SCORE</span>

            <strong>{riskScore}</strong>

            <small>/100</small>
          </div>

          <div className="popup-grid">
            <div>
              <span>Rainfall</span>

              <strong>
                {region.inputSummary?.rainfall ??
                  "--"}{" "}
                mm
              </strong>
            </div>

            <div>
              <span>Slope</span>

              <strong>
                {region.inputSummary?.slope ??
                  "--"}
                °
              </strong>
            </div>

            <div>
              <span>Moisture</span>

              <strong>
                {region.inputSummary?.soilMoisture ??
                  "--"}
                %
              </strong>
            </div>

            <div>
              <span>Stability</span>

              <strong>
                {region.inputSummary?.soilStability ??
                  "--"}
                %
              </strong>
            </div>
          </div>

          <div className="popup-detail">
            <span>MONITORING PRIORITY</span>

            <strong>
              {region.monitoringPriority ||
                "N/A"}
            </strong>
          </div>

          <div className="popup-detail">
            <span>RISK TREND</span>

            <strong>
              {region.trend?.status || "N/A"}
            </strong>
          </div>

          {region.warning && (
            <div className="popup-warning">
              <span>EARLY WARNING</span>

              <p>{region.warning}</p>
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}

function RiskMap({
  regionalData,
  selectedRegion,
  onRegionSelect,
}) {
  const regions = regionalData?.regions || [];

  const [activeFilter, setActiveFilter] =
    useState("All");

  const filteredRegions = useMemo(() => {
    if (activeFilter === "All") {
      return regions;
    }

    return regions.filter(
      (region) =>
        region.riskLevel === activeFilter
    );
  }, [regions, activeFilter]);

  const riskCounts = useMemo(() => {
    return {
      total: regions.length,

      critical: regions.filter(
        (region) =>
          region.riskLevel === "Critical"
      ).length,

      high: regions.filter(
        (region) =>
          region.riskLevel === "High"
      ).length,

      moderate: regions.filter(
        (region) =>
          region.riskLevel === "Moderate"
      ).length,

      low: regions.filter(
        (region) =>
          region.riskLevel === "Low"
      ).length,
    };
  }, [regions]);

  return (
    <div className="interactive-risk-map">
      <MapContainer
        center={[25.8, 92.8]}
        zoom={6}
        minZoom={5}
        maxZoom={10}
        scrollWheelZoom={true}
        className="leaflet-risk-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewUpdater
          selectedRegion={selectedRegion}
        />

        {filteredRegions.map((region) => (
          <AnimatedRiskMarker
            key={region.location}
            region={region}
            selectedRegion={selectedRegion}
            onRegionSelect={onRegionSelect}
          />
        ))}
      </MapContainer>

      {/* =====================================================
          MAP HEADER
          ===================================================== */}

      <div className="map-overlay-header">
        <div>
          <span>LIVE GIS LAYER</span>

          <strong>
            NER REGIONAL RISK
          </strong>
        </div>

        <div className="map-live-indicator">
          <span></span>
          LIVE
        </div>
      </div>

      {/* =====================================================
          RISK FILTER
          ===================================================== */}

      <div className="map-risk-filter">
        <div className="map-filter-title">
          <span>RISK FILTER</span>

          <strong>
            {filteredRegions.length} /{" "}
            {riskCounts.total}
          </strong>
        </div>

        <div className="map-filter-buttons">
          {FILTERS.map((filter) => {
            const isActive =
              activeFilter === filter;

            const count =
              filter === "All"
                ? riskCounts.total
                : riskCounts[
                    filter.toLowerCase()
                  ];

            return (
              <button
                type="button"
                key={filter}
                className={`map-filter-button ${
                  isActive ? "active" : ""
                } ${filter.toLowerCase()}`}
                onClick={() =>
                  setActiveFilter(filter)
                }
              >
                <span>{filter}</span>

                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================
          LIVE MONITORING STATUS
          ===================================================== */}

      <div className="map-monitoring-status">
        <span className="monitoring-beacon"></span>

        <div>
          <strong>
            LIVE MONITORING ACTIVE
          </strong>

          <small>
            Risk indicators update automatically
          </small>
        </div>
      </div>

      {/* =====================================================
          MAP LEGEND
          ===================================================== */}

      <div className="map-overlay-legend">
        <span>
          <i className="legend-dot critical"></i>
          Critical
        </span>

        <span>
          <i className="legend-dot high"></i>
          High
        </span>

        <span>
          <i className="legend-dot moderate"></i>
          Moderate
        </span>

        <span>
          <i className="legend-dot low"></i>
          Low
        </span>
      </div>

      {/* =====================================================
          EMPTY FILTER STATE
          ===================================================== */}

      {regions.length > 0 &&
        filteredRegions.length === 0 && (
          <div className="map-filter-empty">
            <strong>
              No {activeFilter.toLowerCase()}-risk
              regions
            </strong>

            <span>
              Select another risk category to view
              active regional markers.
            </span>
          </div>
        )}

      {!regions.length && (
        <div className="map-overlay-empty">
          <strong>
            Waiting for regional monitoring data
          </strong>

          <span>
            GIS risk markers will appear after the
            monitoring engine returns data.
          </span>
        </div>
      )}
    </div>
  );
}

export default RiskMap;