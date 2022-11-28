import { Document, model, Schema } from 'mongoose';
import { IPostingSchema } from './posting';
import { IUserSchema } from './user';

export interface IBudgetSchema extends Document {
    postings: IPostingSchema[],
    owner: {
        id: IUserSchema
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

export default model('Budget', budgetSchema);
