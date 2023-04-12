import { model, Schema, HydratedDocument } from 'mongoose';
import { IPostingSchema } from './posting';
import { IUserSchema } from './user';

export interface IBudgetSchema {
    postings: HydratedDocument<IPostingSchema>[],
    owner: {
        id: HydratedDocument<IUserSchema>
    },
    currency: string,
    name: string
}

// BUDGET SCHEMA SETUP
const budgetSchema = new Schema<IBudgetSchema>({
  postings: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Posting',
    },
  ],
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  currency: String,
  name: String,
});

const Budget = model('Budget', budgetSchema);

export default Budget;

export type BudgetDocument = ReturnType<(typeof Budget)['hydrate']>;
