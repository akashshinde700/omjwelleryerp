<?php

/*
 * Created on 06-Feb-2011 11:33:47 PM
 *
 * @FileName: omtbccmm.php
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

//include '../php/emConfigDatabase.php';
//include '../php/emOpenDatabase.php';

$query = "CREATE TABLE IF NOT EXISTS cust_comments (
cust_comm_id                INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cust_owner_id               VARCHAR(16),
cust_id                     VARCHAR(16), 
cust_comm_sub               VARCHAR(100),
cust_comm_status            VARCHAR(30),
cust_comm_desc              LONGBLOB,
cust_comm_since             DATETIME,
cust_comm_next_date         VARCHAR(20),
cust_comm_deadline_date     VARCHAR(20),"//ADDED FOR DEADLINE DATE @AUTHOR:MADHUREE-27JUNE2020
."cust_comm_last_comm_date  VARCHAR(20),
cust_comm_media             VARCHAR(50),
cust_comm_lead_name         VARCHAR(50),
cust_comm_ticket_no         INT,"//ADDED FOR TICKET NUMBER FOR TICKET COMMENTS @AUTHOR:MADHUREE-30JUNE2020
."cust_comm_sec_staff_id    VARCHAR(50),
cust_comm_staff_id          VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=101";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//echo "Customer Comments Table Created Successfully.\n";
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//include '../php/emCloseDatabase.php';
?>