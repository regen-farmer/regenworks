import { apiFetchOptions } from "~/util/apiFetchOptions";
import type { FarmScenarioConfigDocument } from "@rw/db/schemas/farmScenarioConfig";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export async function getFarmScenarioConfig(configId: string) {
  const response = await fetch(
    `${BACKEND_URL}/farmscenarioconfigs/${configId}`,
    apiFetchOptions()
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch farm scenario config: ${response.statusText}`);
  }
  
  return response.json() as Promise<FarmScenarioConfigDocument>;
}

export async function getFarmScenarioConfigs(parcelId?: string) {
  const url = parcelId 
    ? `${BACKEND_URL}/parcels/${parcelId}/farmscenarioconfigs`
    : `${BACKEND_URL}/farmscenarioconfigs`;
  
  const response = await fetch(url, apiFetchOptions());
  
  if (!response.ok) {
    throw new Error(`Failed to fetch farm scenario configs: ${response.statusText}`);
  }
  
  return response.json() as Promise<FarmScenarioConfigDocument[]>;
}

export async function createFarmScenarioConfig(config: Partial<FarmScenarioConfigDocument>) {
  const response = await fetch(
    `${BACKEND_URL}/farmscenarioconfigs`,
    {
      ...apiFetchOptions(),
      method: "POST",
      headers: {
        ...apiFetchOptions().headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to create farm scenario config: ${response.statusText}`);
  }
  
  return response.json() as Promise<FarmScenarioConfigDocument>;
}

export async function updateFarmScenarioConfig(
  configId: string,
  updates: Partial<FarmScenarioConfigDocument>
) {
  const response = await fetch(
    `${BACKEND_URL}/farmscenarioconfigs/${configId}`,
    {
      ...apiFetchOptions(),
      method: "PUT",
      headers: {
        ...apiFetchOptions().headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to update farm scenario config: ${response.statusText}`);
  }
  
  return response.json() as Promise<FarmScenarioConfigDocument>;
}

export async function deleteFarmScenarioConfig(configId: string) {
  const response = await fetch(
    `${BACKEND_URL}/farmscenarioconfigs/${configId}`,
    {
      ...apiFetchOptions(),
      method: "DELETE",
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to delete farm scenario config: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getFarmScenarioConfigPreview(configId: string) {
  const response = await fetch(
    `${BACKEND_URL}/farmscenarioconfigs/${configId}/preview`,
    apiFetchOptions()
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to fetch preview: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Failed to fetch farm scenario config preview: ${response.statusText}`);
  }
  
  const text = await response.text();
  if (!text) {
    console.error("Empty response body from preview endpoint");
    throw new Error("Empty response from server");
  }
  
  try {
    return JSON.parse(text) as FarmScenarioConfigDocument;
  } catch (error) {
    console.error("Failed to parse JSON response:", text);
    throw new Error("Invalid JSON response from server");
  }
}