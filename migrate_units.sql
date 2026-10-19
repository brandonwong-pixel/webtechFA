USE housing_sales;

-- Run this once when upgrading an older units table for property image support.
ALTER TABLE units ADD COLUMN image_data LONGTEXT NULL;
