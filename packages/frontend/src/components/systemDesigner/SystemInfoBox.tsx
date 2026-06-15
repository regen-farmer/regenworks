import { type Component, For, type JSX } from "solid-js";
import { difference as turfDifference, area as turfArea } from "@turf/turf";
import type { ISystemBasedLayout } from "@rw/modelling/layout-turf-js/types/system-based-layout.ts";
import { getSpeciesColor } from "~/util/speciesColors";

const SystemInfoBox: Component<{
  systemLayout: ISystemBasedLayout;
  species: any;
  scenarioData: any;
  showFieldScenarioName?: boolean;
  children?: JSX.Element;
}> = (props) => {
  function calculateMarginHeadlandArea(): number {
    try {
      if (!props.scenarioData?.project?.layer?.geometry) {
        console.warn("No geometry available for margin/headland calculation");
        return 0;
      }

      const geometry = turfDifference({
        type: "FeatureCollection",
        features: [
          JSON.parse(props.scenarioData.project.layer.geometry),
          props.systemLayout.headlandPolygon,
        ],
      });

      const area = Number.parseFloat(turfArea(geometry!).toString());

      return area;
    } catch (error) {
      console.error("Error calculating margin/headland area:", error);
      return 0;
    }
  }

  function fieldArea(geometry: string): number {
    try {
      if (!geometry || geometry === "undefined") {
        console.warn("Invalid geometry for field area calculation");
        return 0;
      }
      return turfArea(JSON.parse(geometry));
    } catch (error) {
      console.error("Error calculating field area:", error);
      return 0;
    }
  }

  function groundCoverPercentage(groundCoverArea: string, fieldGeometry: string): string {
    try {
      const area = fieldArea(fieldGeometry);
      if (area === 0) {
        return "0,00";
      }
      return ((Number.parseFloat(groundCoverArea) / area) * 100).toFixed(2).replace(".", ",");
    } catch (error) {
      console.error("Error calculating ground cover percentage:", error);
      return "0,00";
    }
  }

  return (
    <div
      class="dark:bg-background bg-white  text-black  dark:text-white"
      style={{
        position: "absolute",
        padding: "10px",
        "border-radius": "10px",
        "z-index": 10,
        left: "10px",
        bottom: "10px",
      }}
    >
      {props.showFieldScenarioName ? (
        <>
          <p>
            <strong>Field</strong>
            <br />
            {props.scenarioData?.project.layer.name}
          </p>
          <p>
            <strong>Scenario</strong>
            <br />
            {props.scenarioData?.project.name}
          </p>
          <br />
        </>
      ) : (
        <></>
      )}
      <strong>
        <span>Tree and shrub counts:</span>
      </strong>
      <br />

      <For each={props.systemLayout.speciesCountArray}>
        {(speciesEl) => {
          // console.log("species", systemDesignData()?.species);
          const species = props.species.speciesById.get(speciesEl.species);
          if (!species) {
            console.warn(`Species not found:`, speciesEl.species, typeof speciesEl.species);
            return null;
          }
          return (
            <div style={{ display: "flex", "align-items": "center", "margin-bottom": "4px" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  "background-color": getSpeciesColor(speciesEl.species),
                  border: "1px solid rgba(0,0,0,0.3)",
                  "margin-right": "8px",
                  "flex-shrink": "0",
                }}
              />
              <span>
                {species.nameCommon}: {speciesEl.count}
              </span>
            </div>
          );
        }}
      </For>

      {Object.keys(props.systemLayout.groundCoverAreasM2).length > 0 ? (
        <>
          <strong>
            <span>Ground cover:</span>
          </strong>
          <br />
          <For each={Object.keys(props.systemLayout.groundCoverAreasM2)}>
            {(speciesEl) => {
              console.log("groundcover", speciesEl);
              const species = props.species.speciesById.get(speciesEl);
              if (!species) {
                console.warn(`Ground cover species not found: ${speciesEl}`);
                return null;
              }
              return (
                <div style={{ display: "flex", "align-items": "center", "margin-bottom": "4px" }}>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      "background-color": getSpeciesColor(speciesEl),
                      border: "1px solid rgba(0,0,0,0.3)",
                      "margin-right": "8px",
                      "flex-shrink": "0",
                    }}
                  />
                  <span>
                    {species.nameCommon}:{" "}
                    {`${(
                      Number.parseFloat(props.systemLayout.groundCoverAreasM2[speciesEl]) / 10000
                    )
                      .toFixed(2)
                      .replace(".", ",")} ha (${groundCoverPercentage(
                      props.systemLayout.groundCoverAreasM2[speciesEl],
                      props.scenarioData.project.layer.geometry,
                    )}%)`}
                  </span>
                </div>
              );
            }}
          </For>
        </>
      ) : (
        <></>
      )}
      {(props.scenarioData.project.systemdesign?.headland > 0 ||
        props.scenarioData.project.systemdesign?.margin > 0) &&
      calculateMarginHeadlandArea() > 10 ? (
        <>
          <strong>
            <span>Margin & headland:</span>
          </strong>
          <br />
          {`${(calculateMarginHeadlandArea() / 10000).toFixed(2).replace(".", ",")} ha`}
          <br />
        </>
      ) : (
        <></>
      )}

      <strong>
        <span>Field area:</span>
      </strong>
      <br />
      {`${(fieldArea(props.scenarioData.project.layer.geometry) / 10000)
        .toFixed(2)
        .replace(".", ",")} ha`}

      {/* Render children (e.g., buttons) if provided */}
      {props.children}
    </div>
  );
};

export { SystemInfoBox };
