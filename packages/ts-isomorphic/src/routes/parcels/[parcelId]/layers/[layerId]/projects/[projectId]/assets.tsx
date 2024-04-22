import { A, useParams } from "@solidjs/router";
import type { ProjectDocument } from "~/models/project";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import type turf from "@turf/turf";
import { For, createEffect, createResource } from "solid-js";
import maplibregl from "maplibre-gl";

export default function view() {
	const params = useParams<{
		projectId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data] = createResource<{
		trees: turf.FeatureCollection<turf.Polygon, turf.Properties>;
		treecounts: {
			name: string;
			uniqueCount: number;
		}[];
		project: ProjectDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/assets`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	createEffect(() => {
		if (data()) {
			const areaLat = data()?.project.layer.lat;
			const areaLng = data()?.project.layer.lng;

			const trees = data()?.trees;
			// var correcttrees = trees
			// console.log(correcttrees)

			const getgeometry = data()?.project.layer.geometry;
			const correctgeometry = JSON.parse(getgeometry!.replace(/&#34;/g, '"'));
			const map = new maplibregl.Map({
				container: "assetMapShow",
				attributionControl: false,
				style: {
					version: 8,
					sources: {
						"raster-tiles": {
							type: "raster",
							tiles: [
								"https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
							],
							tileSize: 256,
						},
					},
					layers: [
						{
							id: "simple-tiles",
							type: "raster",
							source: "raster-tiles",
							minzoom: 0,
							maxzoom: 21,
						},
					],
				},
				center: [areaLng!, areaLat!],
				zoom: 15,
			});

			map.on("load", () => {
				map.addLayer({
					id: "map",
					type: "fill",
					// @ts-ignore
					source: {
						type: "geojson",
						data: {
							type: "Feature",
							geometry: {
								type: "Polygon",
								coordinates: correctgeometry.geometry.coordinates,
							},
						},
					},
					layout: {},
					paint: {
						"fill-color": "#fff1ff",
						"fill-opacity": 0.6,
						"fill-outline-color": "#F0F8FF",
					},
				});

				map.addLayer({
					id: "map2",
					type: "fill",
					// @ts-ignore
					source: {
						type: "geojson",
						data: trees,
					},
					layout: {},
					paint: {
						"fill-color": "#002eff",
					},
				});
			});
		}
	});

	return (
		<div style={{ padding: "20px" }}>
			<div class="row">
				<div class="col-md-7">
					<div id="assetMapShow" />
					<A
						end={true}
						href={`/parcels/${params.parcelId}/layers/${
							params.layerId
						}/projects/${data()?.project._id}`}
						class="btn mt-2 mb-2 btn-dark"
					>
						<i class="fas fa-arrow-left" /> Back to scenario dashboard
					</A>
				</div>
				<div class="col-md-5">
					<div class="card">
						<div class="card-body">
							<h2 class="card-title">Digital Tree Asset Count</h2>
							<For each={data()?.treecounts}>
								{(count) => (
									<p class="card-text">
										{count.name} assets: {count.uniqueCount}
									</p>
								)}
							</For>
							<p> Total tree assets: {data()?.project.assets.length} </p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
