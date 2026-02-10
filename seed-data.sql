-- ============================================
-- ChemSus Database Seed Data
-- ============================================

-- Clear existing data (optional - comment out if you want to keep existing data)
DELETE FROM pack_pricing;
DELETE FROM shop_items;
DELETE FROM products_page;
DELETE FROM site_settings WHERE key = 'brochure_url';

-- ============================================
-- SITE SETTINGS
-- ============================================
INSERT INTO site_settings (key, value) VALUES ('brochure_url', 'assets/broucher.pdf');

-- ============================================
-- PRODUCTS PAGE
-- ============================================
INSERT INTO products_page (name, description, image, link, is_active, sort_order) VALUES
('Calcium Levulinate', 'Premium pharmaceutical-grade calcium salt for nutraceutical applications with superior bioavailability.', 'assets/cl.jpeg', 'products/calcium-levulinate.html', 1, 1),
('Sodium Levulinate', 'Natural preservative and humectant for cosmetics and personal care products. COSMOS/ECOCERT friendly.', 'assets/sl.jpeg', 'products/sodium-levulinate.html', 1, 2),
('Levulinic Acid', 'Versatile platform chemical for pharmaceuticals, polymers, and green chemistry applications.', 'assets/la.jpeg', 'products/levulinic-acid.html', 1, 3),
('5-HMF', 'High-purity 5-hydroxymethylfurfural for research, polymer synthesis, and pharmaceutical intermediates.', 'assets/5hmf.jpeg', 'products/5-hmf.html', 1, 4),
('Ethyl Levulinate', 'Bio-based green solvent and fuel additive with low toxicity and excellent solvency properties.', 'assets/el.jpeg', 'products/ethyl-levulinate.html', 1, 5),
('Methyl Levulinate', 'Renewable ester solvent for coatings, inks, and biofuel applications.', 'assets/ml.jpeg', 'products/methyl-levulinate.html', 1, 6),
('DALA', 'Delta-aminolevulinic acid for pharmaceutical and agricultural applications.', 'assets/dala.jpeg', 'products/dala.html', 1, 7);

-- ============================================
-- SHOP ITEMS
-- ============================================

-- 1. Calcium Levulinate
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('Calcium Levulinate', 
 'Pharma-grade nutritional supplement', 
 '["High bioavailability", "Pharma & nutraceutical use", "Clean-label", "Superior calcium source", "Easy to formulate"]',
 2000, 
 'in-stock', 
 0, 
 '', 
 'products/calcium-levulinate.html', 
 'assets/cl.jpeg', 
 1, 
 1);

-- 2. Sodium Levulinate
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('Sodium Levulinate', 
 'Natural preservative & stabilizer', 
 '["COSMOS/ECOCERT friendly", "Skin-conditioning", "Water soluble", "Natural preservative", "pH stabilizer"]',
 2000, 
 'in-stock', 
 1, 
 'Free sample available', 
 'products/sodium-levulinate.html', 
 'assets/sl.jpeg', 
 1, 
 2);

-- 3. Levulinic Acid
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('Levulinic Acid', 
 'Versatile platform chemical', 
 '["Green chemistry platform", "Polymers & fuels", "Pharma intermediate", "High purity >99%", "Bio-based"]',
 2000, 
 'in-stock', 
 1, 
 'Free sample available', 
 'products/levulinic-acid.html', 
 'assets/la.jpeg', 
 1, 
 3);

-- 4. 5-HMF
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('5-HMF', 
 'Bio-based intermediate', 
 '["High reactivity", "Resins & coatings", "Sustainable building block", "Research grade", "Pharmaceutical intermediate"]',
 2000, 
 'in-stock', 
 0, 
 '', 
 'products/5-hmf.html', 
 'assets/5hmf.jpeg', 
 1, 
 4);

-- 5. Ethyl Levulinate
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('Ethyl Levulinate', 
 'Green solvent & fuel additive', 
 '["Bio-based ester", "Flavors & fragrances", "Low toxicity", "Excellent solvency", "Biodegradable"]',
 4000, 
 'in-stock', 
 0, 
 '', 
 'products/ethyl-levulinate.html', 
 'assets/el.jpeg', 
 1, 
 5);

-- 6. Methyl Levulinate
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('Methyl Levulinate', 
 'Renewable solvent & intermediate', 
 '["Biofuel additive", "Performance solvent", "Chemical intermediate", "Green alternative", "High purity"]',
 4000, 
 'in-stock', 
 0, 
 '', 
 'products/methyl-levulinate.html', 
 'assets/ml.jpeg', 
 1, 
 6);

-- 7. DALA
INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order) VALUES
('DALA', 
 'Delta-aminolevulinic acid', 
 '["Pharmaceutical grade", "Agricultural applications", "High purity >98%", "Research applications", "Photodynamic therapy"]',
 15000, 
 'in-stock', 
 1, 
 'Limited stock', 
 'products/dala.html', 
 'assets/dala.jpeg', 
 1, 
 7);

-- ============================================
-- PACK PRICING
-- ============================================

-- Get shop item IDs (we'll use them in the INSERT statements)
-- For Calcium Levulinate (ID will be 1)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(1, '100 g', 36.3, 7336, 2000, 1, 1),
(1, '500 g', 116.8, 10735, 7000, 1, 2),
(1, '1 kg', 203, 18658, 10000, 1, 3),
(1, '2 kg', 0, 0, 19000, 1, 4),
(1, '5 kg', 0, 0, 42500, 1, 5);

-- For Sodium Levulinate (ID will be 2)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(2, '100 g', 26, 2390, 2000, 1, 1),
(2, '500 g', 86.7, 7969, 7000, 1, 2),
(2, '1 kg', 144.5, 13281, 10000, 1, 3),
(2, '2 kg', 262.9, 24163, 18000, 1, 4),
(2, '3 kg', 404.8, 37169, 27000, 1, 5),
(2, '5 kg', 642.3, 59034, 42500, 1, 6);

-- For Levulinic Acid (ID will be 3)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(3, '100 g', 40.6, 7373, 2000, 1, 1),
(3, '500 g', 108.1, 9936, 3000, 1, 2),
(3, '1 kg', 164.6, 15128, 5000, 1, 3);

-- For 5-HMF (ID will be 4)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(4, '5 g', 30, 2206, 2000, 1, 1),
(4, '25 g', 85, 6250, 5000, 1, 2),
(4, '100 g', 249, 18290, 15000, 1, 3);

-- For Ethyl Levulinate (ID will be 5)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(5, '100 g', 77, 7077, 4000, 1, 1),
(5, '500 mL', 97, 8915, 7000, 1, 2),
(5, '1 L', 125.5, 11535, 10000, 1, 3);

-- For Methyl Levulinate (ID will be 6)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(6, '100 g', 77, 7077, 4000, 1, 1),
(6, '500 mL', 97, 8915, 7000, 1, 2),
(6, '1 L', 125.5, 11535, 10000, 1, 3);

-- For DALA (ID will be 7)
INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
(7, '5 g', 182.5, 16774, 15000, 1, 1),
(7, '10 g', 273.7, 25156, 20000, 1, 2),
(7, '25 g', 410.7, 37748, 30000, 1, 3),
(7, '100 g', 925.7, 85084, 70000, 1, 4);
