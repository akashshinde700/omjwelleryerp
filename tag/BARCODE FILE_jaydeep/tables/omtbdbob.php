<?php
/*
 * Created on AUG 12, 2024 12:34:56 PM Prathamesh for maintain opening closing balance
 *
 * @FileName: omtbdbob.php
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
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query="CREATE TABLE IF NOT EXISTS dbopening_bal (
dbopenbal_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
dbopenbal_own_id		VARCHAR(16), 
dbopenbal_firm_id		VARCHAR(16), 
dbopenbal_staff_id		VARCHAR(16),
dbopenbal_user_id		VARCHAR(16),
dbopenbal_date                  VARCHAR(32),
dbopenbal_bal			VARCHAR(50),
dbopenbal_cash_bal              VARCHAR(16),
dbopenbal_online_bal            VARCHAR(16),
dbopenbal_bank_bal              VARCHAR(16),
dbopenbal_card_bal              VARCHAR(16),
dbopenbal_ent_dat               DATETIME,
dbopenbal_upd_sts               VARCHAR(50),
dbopenbal_comm			VARCHAR(500),
dbopenbal_last_column           VARCHAR(16))AUTO_INCREMENT=1";
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>