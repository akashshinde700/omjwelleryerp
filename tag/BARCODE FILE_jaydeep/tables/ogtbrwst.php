<?php
/*
 * **************************************************************************************
 * @Description: OMGOLD Stock Table(For Wholesale and Retail).
 * **************************************************************************************
 *
 * Created on Dec 12, 2015 2:48:00 PM
 *
 * @FileName: ogtbrwst.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 * 
 * Project Name: Online Munim ERP Accounting Software 1.0.0
 * Version: 1.0.0
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim.
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS raw_metal (
rwmt_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
rwmt_owner_id                   VARCHAR(16),
rwmt_jrnl_id                    INT,
rwmt_firm_id                    VARCHAR(16),
rwmt_account_id                 VARCHAR(16),
rwmt_metal_type                 VARCHAR(16),
rwmt_item_name                  VARCHAR(80),
rwmt_item_category              VARCHAR(80),
rwmt_item_desc                  VARCHAR(80),
rwmt_item_safe_tray             VARCHAR(80),
rwmt_item_other_info            VARCHAR(100),
rwmt_quantity                   VARCHAR(10),
rwmt_gs_wt                      VARCHAR(50),
rwmt_gs_wt_type                 VARCHAR(10),
rwmt_nt_wt                      VARCHAR(50),
rwmt_nt_wt_type                 VARCHAR(10),
rwmt_fine_wt                    VARCHAR(50),
rwmt_final_fine_wt              VARCHAR(10),
rwmt_tunch                      VARCHAR(15),
rwmt_wastage                    VARCHAR(15),
rwmt_final_tunch                VARCHAR(15),
rwmt_metal_rate_id              VARCHAR(10),
rwmt_metal_rate                 VARCHAR(20),
rwmt_valuation                  VARCHAR(30),
rwmt_final_valuation            VARCHAR(30),
rwmt_vat_charges                VARCHAR(15),
rwmt_tax_charges                VARCHAR(15),
rwmt_since                      DATETIME,
rwmt_status                     VARCHAR(32),
rwmt_tally_date                 VARCHAR(32),
rwmt_staff_id	                VARCHAR(16),
last_column                                     VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>