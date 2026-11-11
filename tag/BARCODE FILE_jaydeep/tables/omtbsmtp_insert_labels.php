<?php
//
$smsTemp = "Dear XXXX has launched XXXX website XXXX";
$smsTemp = stripslashes($smsTemp);
$smsTemp = mysqli_real_escape_string($conn, $smsTemp);
$query = "INSERT INTO sms_templates(
		smtp_own_id,smtp_tp_id,smtp_sub,smtp_text,smtp_type,smtp_owner,smtp_since) 
		VALUES (
		'$ownerId','ProdLaunch','Prod_Launch','$smsTemp','TSMS','omunim',$currentDateTime)";

//if (!mysqli_query($conn,$query)) {
//    die('Error: ' . mysqli_error($conn));
//}
?>