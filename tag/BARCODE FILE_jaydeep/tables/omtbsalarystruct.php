<?php

/*
 * **************************************************************************************
 * @tutorial: salary Table
 * **************************************************************************************
 *
 * Created on 24 August, 2022 1:25:36 PM
 *
 * @FileName: omtbsalarystruct.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS salarystruct (
slstruct_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
slstruct_user_id                     VARCHAR(10),
slstruct_firm_id                     VARCHAR(10),
slstruct_owner_id                    VARCHAR(10),
slstruct_basic_salary                VARCHAR(16),
slstruct_da_allowance                VARCHAR(10),  
slstruct_hra_allowance               VARCHAR(10), 
slstruct_conveyance_allowance        VARCHAR(40),
slstruct_allowance                   VARCHAR(40),
slstruct_medical_allowance           VARCHAR(16),
slstruct_tds_deduction               VARCHAR(16),
slstruct_esi_deduction 		     VARCHAR(16),
slstruct_pf_deduction                VARCHAR(16),
slstruct_leave_deduction             VARCHAR(32),
slstruct_prof_tax_deduction          VARCHAR(32),
slstruct_labour_welfare_deduction    VARCHAR(50),
slstruct_total_deduction             VARCHAR(50),
slstruct_st_add_DOB                  DATETIME,
slstruct_net_salary                  VARCHAR(70),
slstruct_last_column                 VARCHAR(10))AUTO_INCREMENT=1";// Column Added by @Author:Gangadhar-24AUG22 This column will not use

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>