<?php

/*
 * **************************************************************************************
 * @tutorial: OMGOLD New Order Invoice Table @AUTHOR:PRIYA06JAN13
 * **************************************************************************************
 *
 * Created on 17 Dec, 2012 11:31:41 PM
 *
 * @FileName: ogtbemplatte.php
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

$query = "CREATE TABLE IF NOT EXISTS attendance (
                attend_id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
                attend_staff_id             VARCHAR(20),
                attend_staff_name           VARCHAR(40),
                attend_date                 DATE,
                attend_day                  VARCHAR(20),
                attend_login_time           VARCHAR(16),
                attend_logout_time          VARCHAR(16),
                attend_login_ip             VARCHAR(40),
                attend_logout_ip            VARCHAR(40),
                attend_break_start          VARCHAR(16),
                attend_break_end            VARCHAR(16),
                attend_break_time           VARCHAR(16),
                attend_total_hrs            VARCHAR(16),
                attend_gate_login_time      TIME,
                attend_gate_logout_time     TIME,
                attend_gate_in_time         VARCHAR(10),
                attend_gate_out_time        VARCHAR(10),
                attend_gate_total_hrs       VARCHAR(10),
                attend_gate_day_status      VARCHAR(10),
                attend_del_status           VARCHAR(10),"
// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX //
// START CODE TO ADD COLUMNS FOR STAFF WROK REPORT @AUTHOR:MADHUREE-20JUNE2020 //
// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX //
                ."attend_staff_total_calls  VARCHAR(10),
                attend_staff_WRNUM_calls    VARCHAR(10),
                attend_staff_NOTREC_calls   VARCHAR(10),
                attend_staff_INT_calls      VARCHAR(10),
                attend_staff_VINT_calls     VARCHAR(10),
                attend_staff_NINT_calls     VARCHAR(10),
                attend_staff_POST_calls     VARCHAR(10),
                attend_staff_demo_arrange   VARCHAR(10),
                attend_staff_demo_done      VARCHAR(10),
                attend_staff_demo_install   VARCHAR(10),
                attend_staff_cust_con       VARCHAR(10),"
// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX //
// END CODE TO ADD COLUMNS FOR STAFF WROK REPORT @AUTHOR:MADHUREE-20JUNE2020 //
// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX //
                ."attend_since DATETIME,"
        . "last_column      VARCHAR(1)"
        . ")AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 

include 'ommptbauprdwrfl.php';
?>