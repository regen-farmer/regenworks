// import { createEffect, createSignal } from 'solid-js'
// import { createStore } from 'solid-js/store'

// export interface IBreadcrumb {
//   // email?: string,
//   farm?: string
//   field?: string
//   scenario?: string
//   system?: string
// }

// const initializeBreadcrumb = () => {
//   let breadcrumb = {}
// if (typeof localStorage !== 'undefined' && localStorage.getItem('breadcrumb')) {
//   breadcrumb = JSON.parse(
//     localStorage.getItem('breadcrumb')
//       ?? '{}'
//   ) as IBreadcrumb
// }

// console.log('initial', breadcrumb)
//   return breadcrumb
// }

// export const [breadcrumb, setBreadcrumb] = createSignal<IBreadcrumb>(
//   initializeBreadcrumb()
// )

// export const Breadcrumb = ({ children }: any) => {
//   createEffect(() => {
//     console.log('Save', breadcrumb())
//     localStorage.setItem('breadcrumb', JSON.stringify(breadcrumb()))
//   })

//   return <>{children}</>
// }
