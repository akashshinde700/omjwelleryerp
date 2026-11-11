<?php 
/*
 * 
 * Created on Sep 4, 2011 12:22:17 AM
 *
 * @FileName: ormllncm.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
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
//
$query = "CREATE TABLE IF NOT EXISTS ml_comments (
ml_comm_id                              INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ml_comm_ml_id				VARCHAR(16), 
ml_comm_ml_dep_id                       VARCHAR(16), 
ml_comm_cust_id				VARCHAR(16),
ml_comm_own_id				VARCHAR(16), 
ml_comm_comm   				VARCHAR(5000),
ml_comm_ent_dat 			DATETIME,
ml_comm_upd_sts				VARCHAR(50),
ml_comm_staff_id                        VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
?>