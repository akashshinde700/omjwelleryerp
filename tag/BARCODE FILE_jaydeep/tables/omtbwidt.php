<?php

/*
 * **************************************************************************************
 * @tutorial: supplier item details
 * **************************************************************************************
 * 
 * Created on Jul 22, 2014 12:31:09 PM
 *
 * @FileName: omtbwidt.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS supp_item_det (
supp_idt_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
supp_idt_owner_id                   VARCHAR(16),
supp_idt_jrnl_id                    INT,
supp_idt_firm_id                    VARCHAR(16),
supp_idt_supp_id                    VARCHAR(16),
supp_idt_pay_id                     VARCHAR(16),
supp_idt_pre_inv_no                 VARCHAR(10),
supp_idt_inv_no                     VARCHAR(50),
supp_idt_metal_type                 VARCHAR(16),
supp_idt_ornaments                  VARCHAR(80),
supp_idt_gs_wt                      VARCHAR(15),
supp_idt_gs_wt_type                 VARCHAR(10),
supp_idt_nt_wt                      VARCHAR(15),
supp_idt_nt_wt_type                 VARCHAR(10),
supp_idt_fine_wt                    VARCHAR(15),
supp_idt_fine_wt_type               VARCHAR(10),
supp_idt_metal_rate                 VARCHAR(20),
supp_idt_lab_charges                VARCHAR(15),
supp_idt_lab_charges_type           VARCHAR(10),
supp_idt_valuation                  VARCHAR(30),
supp_idt_tax                        VARCHAR(15),
supp_idt_fin_valuation              VARCHAR(30),
supp_idt_since                      DATETIME,
supp_idt_status                     VARCHAR(32),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>