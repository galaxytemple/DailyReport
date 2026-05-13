-- Vector index for fast similarity search on raw_data.embedding.
-- IVF (Inverted File) with 2 neighbor partitions — appropriate for small datasets.
-- Increase neighbor_partitions if data grows beyond ~100k rows.
CREATE VECTOR INDEX raw_data_emb_vidx
  ON raw_data (embedding)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH TARGET ACCURACY 90
  DISTANCE COSINE
  PARAMETERS (type IVF, neighbor partitions 2);
