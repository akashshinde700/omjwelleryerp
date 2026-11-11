<?php
/*
 * **********************************************************************************************************************
 * @tutorial: START CODE FOR MASTER ITEM TABLE @PRIYANKA-19FEB18
 * *********************************************************************************************************************
 * 
 * Created on FEB 19, 2018 17:29:00 PM
 *
 * @FileName: omtbmsitm.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR: @PRIYANKA-19FEB18
 *  REASON:
 *
 */
?>
<?php
// START CODE TO CREATE MASTER ITEM TABLE @PRIYANKA-19FEB18
// LAST 5 NEW COLUMNS ARE ADDED @HEMA-8APR19
$query = "CREATE TABLE IF NOT EXISTS master_item (
ms_itm_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ms_itm_itm_id               VARCHAR(25),
ms_itm_own_id               VARCHAR(16),
ms_itm_type                 VARCHAR(25),
ms_itm_metal                VARCHAR(25),
ms_itm_group                VARCHAR(50),
ms_itm_category             VARCHAR(100),
ms_itm_sub_category         VARCHAR(50),
ms_itm_name                 VARCHAR(100),
ms_itm_brand_name           VARCHAR(50),
ms_itm_brand_origin         VARCHAR(50),
ms_itm_form_name            VARCHAR(50),
ms_itm_industry             VARCHAR(100),
ms_itm_user_group           VARCHAR(50),
ms_itm_avg_weight           VARCHAR(15),
ms_itm_avg_weight_type      VARCHAR(10),
ms_itm_add_date             DATETIME,
ms_itm_unit                 VARCHAR(16),
ms_itm_sub_unit             VARCHAR(16),
ms_itm_conversion_rate      VARCHAR(16),
ms_itm_hsn_no               VARCHAR(16),
ms_itm_barcode              VARCHAR(64),
ms_itm_color                VARCHAR(16),
ms_itm_shape                VARCHAR(16),
ms_itm_size                 VARCHAR(16),
ms_itm_length               VARCHAR(16),
ms_itm_width                VARCHAR(16),
ms_itm_purity               VARCHAR(16),
ms_itm_clarity              VARCHAR(16),
ms_itm_pre_id               VARCHAR(64),
ms_itm_post_id              VARCHAR(16),
ms_itm_from_wt              VARCHAR(16),
ms_itm_to_wt                VARCHAR(16),
ms_itm_max_qty              VARCHAR(16),
ms_itm_min_qty              VARCHAR(16),
ms_itm_min_qty_type         VARCHAR(16),
ms_itm_wholesale_stock_min  VARCHAR(16),
ms_itm_wholesale_stock_max  VARCHAR(16),
ms_itm_wholesale_stock_type VARCHAR(16),
ms_itm_model_no             VARCHAR(64),
ms_itm_prod_desc            VARCHAR(80),
ms_itm_tag_template         VARCHAR(32),
ms_itm_tag_panel            VARCHAR(32),
ms_itm_sub_item             VARCHAR(16),
ms_itm_purchase_price       VARCHAR(25),
ms_itm_sell_price           VARCHAR(25),
ms_itm_mrp                  VARCHAR(25),
ms_itm_taxincl_checked      VARCHAR(10),
ms_itm_pur_price_with_gst   VARCHAR(25),
ms_itm_sell_price_with_gst  VARCHAR(25),
ms_itm_mrp_with_gst         VARCHAR(25),
ms_itm_wholesale_pur_price  VARCHAR(25),
ms_itm_wholesale_sell_price VARCHAR(25),
ms_itm_wholesale_taxincl_checked        VARCHAR(10),
ms_itm_wholesale_pur_price_with_gst     VARCHAR(25),
ms_itm_wholesale_sell_price_with_gst    VARCHAR(25),
ms_itm_gst                  VARCHAR(16),
ms_itm_cgst_sgst            VARCHAR(16),
ms_itm_igst                 VARCHAR(16),
ms_itm_pur_account_id       VARCHAR(10),
ms_itm_sell_account_id      VARCHAR(10),
ms_itm_price_code           VARCHAR(25), 
ms_itm_price_code_val       VARCHAR(25), 
ms_itm_price_code_type      VARCHAR(25), 
ms_itm_price_code_num       VARCHAR(25), 
ms_itm_unit_price           VARCHAR(25),
ms_itm_wstg_min             VARCHAR(25),
ms_itm_wstg_max             VARCHAR(25),
ms_itm_size_min             VARCHAR(25),
ms_itm_size_max             VARCHAR(25),
ms_itm_wstg_type            VARCHAR(25),
ms_itm_mkg_min              VARCHAR(25),
ms_itm_mkg_max              VARCHAR(25),
ms_itm_mkg_type             VARCHAR(25),
ms_itm_disc_code            VARCHAR(25),
ms_itm_disc                 VARCHAR(25),
ms_itm_disc_min             VARCHAR(25),
ms_itm_disc_max             VARCHAR(25),
ms_itm_disc_type            VARCHAR(25),
ms_itm_disc_on_amt          VARCHAR(25),
ms_itm_cat_image_id         VARCHAR(8),
ms_itm_image_id_0           VARCHAR(8),
ms_itm_image_id_1           VARCHAR(8),
ms_itm_image_id_2           VARCHAR(8),
ms_itm_image_id_3           VARCHAR(8),
ms_itm_image_id_4           VARCHAR(8),
ms_itm_image_id_5           VARCHAR(8),
ms_itm_other_lang           VARCHAR(25),
ms_itm_other_lang_name      VARCHAR(100),".
"ms_itm_min_weight          VARCHAR(25),". // COLUMN ADDED TO STORE PRODUCT MINIMUM WEIGHT @AUTHOR:MADHUREE-23JULY2022
"ms_itm_max_weight          VARCHAR(25),". // COLUMN ADDED TO STORE PRODUCT MAXIMUM WEIGHT @AUTHOR:MADHUREE-23JULY2022
"ms_itm_min_size            VARCHAR(25),". // COLUMN ADDED TO STORE PRODUCT MINIMUM SIZE @AUTHOR:MADHUREE-06JULY2022
"ms_itm_max_size            VARCHAR(25),". // COLUMN ADDED TO STORE PRODUCT MAXIMUM SIZE @AUTHOR:MADHUREE-06JULY2022
"ms_itm_size_type           VARCHAR(15),". // COLUMN ADDED TO STORE PRODUCT SIZE TYPE @AUTHOR:MADHUREE-06JULY2022
"ms_itm_other_info          VARCHAR(100),"
. "last_column                VARCHAR(1))AUTO_INCREMENT = 1";
//
if (!mysqli_query($conn,$query)) {
    die('Error master_item: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
// END CODE TO CREATE MASTER ITEM TABLE @PRIYANKA-19FEB18
?>