const mongoose = require('mongoose');

const { Schema } = mongoose;

const BrzImageMetaSchema = new Schema(
  {
    url: { type: String, default: '' },
    key: { type: String, default: '' },
    contentType: { type: String, default: '' },
    bytes: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    variants: { type: Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

module.exports = BrzImageMetaSchema;
