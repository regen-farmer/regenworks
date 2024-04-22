// // import { mongoDBDBUser } from "~/auth/useAuth"
// import { paymentPlan } from "./paymentPlan"
// import { createMemo } from "solid-js"

// export const allowFarmCreation = createMemo<boolean>(()=>{
//   const mongoDBDBUser = undefined;
//   if (mongoDBDBUser) {
//   return (mongoDBDBUser() && mongoDBDBUser().isAdmin)
//   || (paymentPlan() === 'farm' && mongoDBDBUser() && mongoDBDBUser().parcels?.length < 1)
//   || (paymentPlan() === 'advisor' && mongoDBDBUser() && mongoDBDBUser().parcels?.length < 10)
//   } else {
//     return false
//   }
// })
