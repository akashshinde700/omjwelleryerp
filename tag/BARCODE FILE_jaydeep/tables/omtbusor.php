<?php

/*
 * **************************************************************************************
 * @tutorial: OMGOLD New Order Table
 * **************************************************************************************
 *
 * Created on 08 Jul, 2016 11:31:41 AM
 *
 * @FileName: omtbusor.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2016 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

//*******************************Start code to create user_order_table for order both supplier and customer panel Author:SANT21SEP16*******************************
$query = "CREATE TABLE IF NOT EXISTS user_order (
usor_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
usor_owner_id                   VARCHAR(16),
usor_jrnl_id                    INT,
usor_firm_id                    VARCHAR(16), 
usor_acc_id                     VARCHAR(16), 
usor_cust_id                    INT,
usor_supp_id                    VARCHAR(16),
usor_DOB                        VARCHAR(50),
usor_cust_bill_date             VARCHAR(50),
usor_add_date                   VARCHAR(50),
usor_DOB_Del                    VARCHAR(50),
usor_pre_invoice_no             VARCHAR(50),
usor_invoice_no                 VARCHAR(50),
usor_metal_type                 VARCHAR(16),
usor_metal_No                   VARCHAR(16),
usor_pre_item_id                VARCHAR(16),
usor_item_id                    VARCHAR(16),
usor_item_name                  VARCHAR(80),
usor_item_category              VARCHAR(80),
usor_quantity                   VARCHAR(80),
usor_item_desc                  VARCHAR(80),
usor_item_safe_tray             VARCHAR(80),
usor_item_oth_info              VARCHAR(100),
usor_item_quantity              VARCHAR(10),
usor_item_bis_mark              VARCHAR(10),
usor_item_hall_mark             VARCHAR(10),
usor_item_gs_weight             VARCHAR(15),
usor_item_gs_wt_type            VARCHAR(10),
usor_item_nt_weight             VARCHAR(15),
usor_item_nt_wt_type            VARCHAR(10),
usor_item_wt_by                 VARCHAR(15),
usor_item_fine_Weight           VARCHAR(15),
usor_fine_wt                    VARCHAR(15),
usor_final_fine_wt              VARCHAR(10),
usor_item_purity                VARCHAR(15),
usor_final_purity               VARCHAR(15),
usor_tunch                      VARCHAR(15),
usor_final_tunch                VARCHAR(15),
usor_wastage                    VARCHAR(15),
usor_cust_wstg                  VARCHAR(15),
usor_cust_wstg_val              VARCHAR(15),
usor_lab_charges                VARCHAR(15),
usor_lab_charges_type           VARCHAR(10),
usor_lab_charges_val            VARCHAR(10),
usor_item_lab_charges           VARCHAR(15),
usor_item_lab_charges_type      VARCHAR(10),
usor_lab_oth_charges            VARCHAR(15),
usor_lab_oth_charges_type	VARCHAR(10),
usor_item_oth_charges           VARCHAR(15),
usor_item_oth_charges_type      VARCHAR(10),
usor_metal_rate_id              VARCHAR(10),
usor_metal_rate                 VARCHAR(20),
usor_valuation                  VARCHAR(30),
usor_item_valuation             VARCHAR(30),
usor_cry_valuation              VARCHAR(30),
usor_vat_charges                VARCHAR(15),
usor_tax_oth_charges            VARCHAR(15),
usor_cry_tax_charges            VARCHAR(15),
usor_final_valuation            VARCHAR(30),
usor_nwor_id                    INT,
usor_since                      DATETIME,
usor_status                     VARCHAR(32),
usor_order_status               VARCHAR(32),
usor_supp_status                VARCHAR(32),
usor_priority                   VARCHAR(16),
usor_loyal_points               VARCHAR(16),
usor_item_other_info            VARCHAR(16),
usor_ratecutopt                 VARCHAR(16),
usor_order_type                 VARCHAR(16),
usor_order_upd_status           VARCHAR(16),
usor_upd_pre_item_id            VARCHAR(16),
usor_upd_item_id                VARCHAR(16),
usor_snap                       LONGBLOB,
usor_gs_weight                  VARCHAR(15),
usor_gs_weight_type             VARCHAR(10),
usor_nt_weight                  VARCHAR(15),
usor_nt_weight_type             VARCHAR(10),
usor_final_weight               VARCHAR(15),
usor_final_weight_type          VARCHAR(10),
usor_del_final_wt               VARCHAR(15),
usor_del_final_wt_type          VARCHAR(10),
usor_del_item_final_val         VARCHAR(30),
usor_del_cry_wt                 VARCHAR(15),
usor_del_cry_wt_typ             VARCHAR(10),
usor_del_cry_final_val          VARCHAR(30),
usor_del_final_val              VARCHAR(30),
usor_deliv_pre_id               VARCHAR(15),
usor_deliv_post_id              VARCHAR(10),
usor_deliv_cry_id               VARCHAR(10),
usor_deliv_gs_wt                VARCHAR(10),
usor_deliv_gs_wt_type           VARCHAR(10),
usor_snap_thumb                 LONGBLOB,
usor_snap_fname                 VARCHAR(150),
usor_snap_ftype                 VARCHAR(20),
usor_snap_fsize                 VARCHAR(40),
usor_snap_fszMB                 VARCHAR(40),
usor_staff_id	                VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (usor_metal_No,usor_item_id)) AUTO_INCREMENT=10001";
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//*******************************End code to create user_order_table for order both supplier and customer panel Author:SANT21SEP16*******************************
?>
