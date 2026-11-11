<?php
/*
 * **************************************************************************************
 * @tutorial:CREATE TABLE TO STORE BANKSTATEMENT DETAILS(FOR ICICI BANK API )
 * ***************************************************************************************
 * Created on 07-NOV-2022 PM
 *
 * @FileName: omtbbankstmt.php
 * @Author: Renuka Sharma
 * @AuthorEmailId:  renukas@omunim.com
 * @version 2.7
 * @Copyright (c)  www.omunim.com
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS bank_statement(
        bs_id                 INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        bs_firm_id            VARCHAR(12),
        bs_bank_name          VARCHAR(30),
        bs_cheque_no          VARCHAR(30),
        bs_txt_date           VARCHAR(20),
        bs_remarks            VARCHAR(150),
        bs_amount             VARCHAR(20),
        bs_balance            VARCHAR(20),
        bs_value_date         VARCHAR(20),
        bs_type               VARCHAR(10),
        bs_settlement_id      VARCHAR(30),
        bs_settlement_status  VARCHAR(30),
        bs_transaction_id     VARCHAR(30),
        UNIQUE KEY (bs_transaction_id),
        last_column        VARCHAR(1))AUTO_INCREMENT=1";
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
?>
