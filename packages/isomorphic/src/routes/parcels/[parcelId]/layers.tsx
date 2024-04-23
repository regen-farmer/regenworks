// export const [currentLayer, setCurrentLayer] = createSignal('');

export function LayerOutlet(props: any) {
	// const params = useParams();

	// setBreadcrumb({...breadcrumb(), field: params.layerId});
	// console.log('field', breadcrumb())

	// // createEffect(()=>{
	// // })

	return props.children;
}
