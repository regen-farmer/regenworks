import { A, useParams } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import type turf from "@turf/turf";
import { For, createEffect, createResource, onCleanup } from "solid-js";
import maplibregl from "maplibre-gl";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

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
				style: GoogleSatStyle,
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

			onCleanup(() => {
				if (map) {
					map.remove();
				}
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
						class="rounded-sm p-1 my-1 mt-2 mb-2 btn-default"
					>
						<i class="fas fa-arrow-left" /> Back to scenario dashboard
					</A>
				</div>
				<div class="col-md-5">
					<div class="card">
						<div class="card-body">
							<h2 class="h2 card-title">Digital Tree Asset Count</h2>
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
