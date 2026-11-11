<?php

/*
 * **************************************************************************************
 * @tutorial: staff Access Table
 * **************************************************************************************
 * 
 * Created on Jun 4, 2013 1:36:21 PM
 *
 * @FileName: omtbeacc.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
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
$query = "CREATE TABLE IF NOT EXISTS omaccess (
omac_id          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
omac_own_id	 VARCHAR(16),
omac_emp_id      VARCHAR(10),
omac_ogiamsdv    VARCHAR(10),
omac_ogidmndv    VARCHAR(10),
omac_ogialdel	 VARCHAR(10),
omac_ogspmndv	 VARCHAR(10),
omac_ogspidel	 VARCHAR(10),
omac_ognomndv	 VARCHAR(10),
omac_ognoidel	 VARCHAR(10),
omac_ogwaspdv	 VARCHAR(10),
omac_ogwuspdv	 VARCHAR(10),
omac_ogwdtdel	 VARCHAR(10),
omac_orgacang    VARCHAR(10),
omac_orgugvdt 	 VARCHAR(10),
omac_orgdgvdl 	 VARCHAR(10),
omac_omgnsfan 	 VARCHAR(10),
omac_omuudetl 	 VARCHAR(10),
omac_omupudmn 	 VARCHAR(10),
omac_omccdelc 	 VARCHAR(10),
omac_omaimndv 	 VARCHAR(10),
omac_omaiumndv 	 VARCHAR(10),
omac_omaiatdl 	 VARCHAR(10),
omac_omcaadcd 	 VARCHAR(10),
omac_omcdcdfu 	 VARCHAR(10),
omac_omcdcsdl 	 VARCHAR(10),
omac_omffadfr 	 VARCHAR(10),
omac_omfffudv 	 VARCHAR(10),
omac_omffdlfr 	 VARCHAR(10),
omac_omacacdv 	 VARCHAR(10),
omac_omacacud 	 VARCHAR(10),
omac_omeheacc 	 VARCHAR(10),
omac_omeastdv 	 VARCHAR(10),
omac_omeustdv 	 VARCHAR(10),
omac_ogedtdel 	 VARCHAR(10),
omac_omcssmsp 	 VARCHAR(10),
omac_omibcdel 	 VARCHAR(10),
omac_omtatrnd 	 VARCHAR(10),
omac_omddddan 	 VARCHAR(10),
omac_omacjnen 	 VARCHAR(10),
omac_ombbblsh 	 VARCHAR(10),
omac_omactrbl 	 VARCHAR(10),
omac_omacblst 	 VARCHAR(10),
omac_ommramrd    VARCHAR(10),
omac_omiaaind    VARCHAR(10),
omac_omiaaitd    VARCHAR(10),
omac_omvvaacd    VARCHAR(10),
omac_omvsaasd    VARCHAR(10),
omac_omvcaacd    VARCHAR(10),
omac_orguroid    VARCHAR(10),
omac_omppfmsp    VARCHAR(10),
omac_ompprppn    VARCHAR(10),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//ogiamsdv - Add Stock
//ogidmndv - Update Stock
//ogialdel - Delete Stock
//ogspmndv - Add Sell Transaction
//ogspidel - Delete Sell Transaction
//ognomndv - Add New Order
//ognoidel - Delete New Order
//ogwaspdv - Add New Supplier
//ogwuspdv - Update Supplier
//ogwdtdel - Delete Supplier
//orgacang - Add New Girvi
//orgugvdt - Update Girvi
//orgacang - Delete Girvi
//omgnsfan - Analysis Panel
//omuudetl - Add New Udhaar
//omupudmn - Update Udhaar
//omccdelc - Delete Udhaar
//omaimndv - Add New Action Item
//omaiumndv- Update Action Item
//omaiatdl - Delete Action Item
//omcaadcd - Add New Customer
//omcdcdfu - Update Customer
//omcdcsdl - Delete Customer  
//omffadfr - Add Firm
//omfffudv - Update Firm
//omffdlfr - Delete Firm
//omacacdv - Add Account
//omacacud - Update Account
//omeastdv - Add Staff
//omeustdv - Update Staff
//ogedtdel - Delete Staff
//omcssmsp - SMS
//omibcdel - Delete BarCode
//omtatrnd - Transaction Panel
//omddddan - Daily Diary
//omacjnen - Journal Book
//ombbblsh - Stock Register
//omactrbl - Trial Balance
//omacblst - Balance Sheet
//ommramrd - Add Metal Rate
//omiaaind - Add Item Name
//omiaaitd - Add Tunch
//omvvaacd - Add City
//omvsaasd - Add State
//omvcaacd - Add Country
//orguroid - Add ROI
//omppfmsp - All Forms
//ompprppn - Datebase Repair
?>