<?php
/*
 * **************************************************************************************
 * @Description: OMGOLD Stock Table(For Wholesale and Retail)
 * **************************************************************************************
 *
 * Created on Dec 12, 2015 2:48:00 PM
 *
 * @FileName: ogtbitst.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 * MODIFICATION DATE:
 * AUTHOR:
 * REASON:
 *
 * Project Name: Online Munim ERP Accounting Software 1.0.0
 * Version: 1.0.0
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim
 */
?>
<?php
// Change in file for adding new columns in stock table @SANT29MAY17
// Creating stock table @PRIYANKA29MAY17
$query = "CREATE TABLE IF NOT EXISTS stock (
st_id                                           INT NOT NULL PRIMARY KEY AUTO_INCREMENT,".
// common fields in stock table like owner,firm        
"st_owner_id                                    VARCHAR(16),
st_firm_id                                      VARCHAR(16),".
// Product details column in stock table     
"st_metal_type 					VARCHAR(16),
st_product_type 			        VARCHAR(32),    
st_stock_type                                   VARCHAR(16),
st_item_name 					VARCHAR(80),
st_item_category 				VARCHAR(80),".
// Barcode Columns Added @Author:PRIYANKA-30JUNE17
//st_pkt_weight - Used this for stock less weight
//st_less_weight - Used this for stock pkt weight
"st_barcode_prefix                               VARCHAR(10),
st_barcode 					VARCHAR(10), 
st_quantity 					VARCHAR(10),
st_purity 					VARCHAR(15),
st_avg_purity 					VARCHAR(15),
st_wastage 					VARCHAR(15),
st_final_purity 				VARCHAR(16),
st_avg_wastage 					VARCHAR(15),
st_metal_rate 					VARCHAR(20),
st_pur_avg_rate                                 VARCHAR(20),
st_gs_weight 					VARCHAR(16),
st_gs_weight_type 				VARCHAR(10),
st_pkt_weight 					VARCHAR(16),
st_pkt_weight_type 				VARCHAR(10),
st_less_weight 					VARCHAR(16),
st_less_weight_type 				VARCHAR(10),
st_counter_name 				VARCHAR(16),
st_counter_id				        VARCHAR(10),
st_nt_weight 					VARCHAR(16),
st_nt_weight_type 				VARCHAR(10),
st_tag_weight 					VARCHAR(16),
st_fine_weight 					VARCHAR(16),
st_fine_weight_type 				VARCHAR(10),
st_final_fine_weight 				VARCHAR(16),
st_purchase_rate                                VARCHAR(16),
st_purchase_rate_type                           VARCHAR(10),
st_sell_rate                                    VARCHAR(16),
st_sell_rate_type                               VARCHAR(10),".
// other charges column in stock table        
"st_lab_charges                                 VARCHAR(15),
st_lab_charges_type                             VARCHAR(10),
st_making_charges 				VARCHAR(15),
st_making_charges_type                          VARCHAR(10),".
// AVG LAB CHARGES AND AVG OTHER CHARGES IN STOCK TABLE @AUTHOR-PRIYANKA-11AUG20
"st_pur_avg_lab_chrgs                           VARCHAR(20),
st_pur_avg_other_chrgs                          VARCHAR(20),
st_tot_tax 					VARCHAR(16),
st_tax                                          VARCHAR(16),".
// valuation & crystal final valuation column       
"st_valuation 					VARCHAR(50),
st_stone_valuation 				VARCHAR(50),
st_final_valuation 				VARCHAR(50),
st_since 					VARCHAR(50),".
// status details in stock table      
"st_status 					VARCHAR(16),
st_item_code                                    VARCHAR(16),
st_type 					VARCHAR(16),".
// Added New Columns For Discount Management Functionality @Author:PRIYANKA-20-OCT-2020          
"st_disc_product_amount 			VARCHAR(16),
 st_online_product_disc 			VARCHAR(16),
 st_online_product_price_bounce 			VARCHAR(16),
st_disc_making_discount 			VARCHAR(16),
st_disc_stone_discount                          VARCHAR(16),
st_disc_product_discount 			VARCHAR(16),".
// Added New Columns For Retail Discount Management Functionality @Author:SHRIKANT-17-JAN-2023          
"st_product_commission_amount 			VARCHAR(16),
st_disc_start_date                              VARCHAR(32),
st_disc_end_date                                VARCHAR(32),
".        
// Columns used in Imitation Panel        
"st_price                                       VARCHAR(16),
st_price_without_tax                            VARCHAR(16),    
st_cust_itmpricecode                            VARCHAR(16),
st_cust_itmcode                                 VARCHAR(16),
st_cust_itmcalby                                VARCHAR(16),
st_cust_itmnum                                  VARCHAR(16),
st_item_model_no                                VARCHAR(16)," .
//  Columns used in Imitation Panel        
"st_purches_discount_per                        VARCHAR(16),
 st_metal_discount_per                          VARCHAR(16),
 st_purches_discount_amt                        VARCHAR(16),
 st_metal_discount_amt                          VARCHAR(16),
 st_pur_other_chrgs                             VARCHAR(16),
 st_other_charges                               VARCHAR(16)," .
// Added New Columns Added for OMRETAIL SOFTWARE @Author:PRIYANKA-28JUNE20         
"st_period                                      VARCHAR(16),
st_period_type                                  VARCHAR(16),
st_cust_price                                   VARCHAR(16),".
// New Columns Added for Wholesale Sell @Author:PRIYANKA-17JUN17      
"st_shape                                       VARCHAR(16),
st_size                                         VARCHAR(16),
st_item_length                                  VARCHAR(16),
st_item_width                                   VARCHAR(16),
st_item_sales_pkg                               VARCHAR(16),
st_clarity                                      VARCHAR(16),
st_color                                        VARCHAR(16),
st_image_id                                     VARCHAR(10),
st_item_other_info                              VARCHAR(16),".
// New column added for discount percent @author:Hema-2JAN20       
"st_discount_per                                VARCHAR(16),".
// Added New Columns for Retail and Wholesale Purity/Charges
"st_retail_purity                               VARCHAR(15),
st_retail_wastage                               VARCHAR(15),
st_retail_making_charges                        VARCHAR(15),
st_retail_making_charges_type                   VARCHAR(15),
st_wholesale_purity                             VARCHAR(15),
st_wholesale_wastage                            VARCHAR(15),
st_wholesale_making_charges                     VARCHAR(15),
st_wholesale_making_charges_type                VARCHAR(15),
st_sell_purity                                  VARCHAR(15),".
"st_st_id                                       VARCHAR(16),".
"st_indicator                                   VARCHAR(16),
last_column                                     VARCHAR(1))AUTO_INCREMENT=1";// Column Added by @Author:Love-11SEP17 This column will not use

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>