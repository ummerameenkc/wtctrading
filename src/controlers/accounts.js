const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const   fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {getStock}   = require('../models/stock');
const  {Database}   = require('../utils/Database');
const  { exit } = require('process');
const  {Transaction}   = require('../utils/TranDB');

let    db = new Database();
let    Tran = new Transaction();




let getBranchBalance = async(req,res,next)=>{
    let payLoad = req.body;
   let cluases = ` `
   if(payLoad.branchId != undefined && payLoad.branchId != null){
       cluases +=  ` and b.branch_id = ${payLoad.branchId} `
   }

   let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


 
   let [branchBalancesErr,branchBalances] =  await _p(db.query(`select b.branch_name,b.branch_address,
    
        ( 
            select ifnull(sum(bt.tran_amount),0) as tran_amount
             from tbl_branch_transactions bt 
             where bt.status = 'a' and bt.to_branch_id = b.branch_id
                   
                   ${dateCluases != '' ? ` and bt.tran_date ${dateCluases}` : ''}
        ) as transferAmount,

        ( 
            select ifnull(sum(bt.tran_amount),0) as tran_amount
             from tbl_branch_transactions bt 
             where bt.status = 'a' and bt.from_branch_id =  b.branch_id
                   
                   ${dateCluases != '' ? ` and bt.tran_date ${dateCluases}` : ''}
        ) as receivedAmount,

        (
            select   ( transferAmount   ) - (receivedAmount)   
        ) as balance


        from tbl_branches b
        where b.branch_status = 'active' 
        and b.branch_id != ${req.user.user_branch_id}
        ${cluases}

        order by b.branch_name   asc `)).then(result=>{
        return result;
    });

    if(branchBalances && !branchBalances){
        next(branchBalancesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {accounts      : branchBalances}
    }

    let resFormat = {
        total_balance : branchBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}



router.post(`/api/get-branch-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
        let dateFrom = payLoad.dateFrom
        let dateTo = payLoad.dateTo

      
    let [debitorLedgerErr,debitorLedger] =  await _p(db.query(`
            select 
                '1' as sequence,
                 bt.tran_date as creation_date,
                 concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
                 bt.tran_code as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(bt.tran_amount,0.00) as credit_amount
                
                 from tbl_branch_transactions bt
                 left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
                 left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

                 where bt.status = 'a' and bt.from_branch_id = ${payLoad.branchId}

                 union  select 

                 '2' as sequence,
                 bt.tran_date as creation_date,
                 concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
                 bt.tran_code as vch_no,
                 'Payment' as vch_type,
                 ifnull(bt.tran_amount,0.00)  as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_branch_transactions bt
                 left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
                 left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

                 where bt.status = 'a' and bt.to_branch_id = ${payLoad.branchId}
                
                 
                order by creation_date,sequence asc
         
         `)).then(result=>{
         return result;
     });

     if(debitorLedgerErr && !debitorLedger){
        next(debitorLedgerErr)
     }

     // Get Opening Balance
 
    let opening_balance  = 0
    let closing_balance  = 0
    

    let newLedger = debitorLedger.map((value,index) => {
        let lastBalance  = index == 0 ? 0 : debitorLedger[index - 1].balance;
        value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
        return value;
    });



    if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
        let prevTrans =  newLedger.filter((payment)=>{
             return payment.creation_date < dateFrom
         });
 
         opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
         
         newLedger =  newLedger.filter((payment)=>{
             return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
         });

     }


        if(newLedger.length > 0){
            closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
        }


     res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 })

router.post(`/api/get-branch-balance`,async(req,res,next)=>{
   
    let result = await getBranchBalance(req,res,next) 
    res.json(result)
});


router.post(`/api/get-sundry-debitor-balance`,async(req,res,next)=>{
   
    let result = await getDebtorBalance(req,res,next) 
    res.json(result)
});


router.post(`/api/get-advance-debitor-balance`,async(req,res,next)=>{
   
    let result = await getAdvanceDebtorBalance(req,res,next) 
    res.json(result)
});

router.post(`/api/get-advance-creditor-balance`,async(req,res,next)=>{
   
    let result = await getAdvanceCreditorBalance(req,res,next) 
    res.json(result)
});


let getAdvanceCreditorBalance = async(req,res,next)=>{
    let payLoad = req.body;
   let cluases = ` `
   if(payLoad.accId != undefined && payLoad.accId != null){
       cluases +=  ` and acc.acc_id = ${payLoad.accId} `
   }


   let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


   if(payLoad.locationId != undefined && payLoad.locationId != null){
    cluases +=  ` and acc.location_id = ${payLoad.locationId} `
   }
   let [errDebitorBalances,debitorBalances] =  await _p(db.query(`select acc.acc_name,acc.contact_no,acc.address,
       

        ( 
            select ifnull(sum(at.tran_amount),0) as pay_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'payment'
                   and at.acc_type = 'creditor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as pay_amount,

        ( 
            select ifnull(sum(at.tran_amount),0) as rcv_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'receive'
                   and at.acc_type = 'creditor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as rcv_amount,

        (
            select pay_amount - rcv_amount 
        ) as balance
        from tbl_accounts acc
        where acc.status = 'a' 
        and acc.party_type <> 'general'
        and acc.branch_id = ${req.user.user_branch_id}
        and acc.acc_type_id = 'creditor'
        ${cluases}

        order by acc.acc_name   asc `)).then(result=>{
        return result;
    });

    if(errDebitorBalances && !debitorBalances){
        next(errDebitorBalances)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {accounts      : debitorBalances}
    }

    let resFormat = {
        total_balance : debitorBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}


let getAdvanceDebtorBalance = async(req,res,next)=>{
    let payLoad = req.body;
   let cluases = ` `
   if(payLoad.accId != undefined && payLoad.accId != null){
       cluases +=  ` and acc.acc_id = ${payLoad.accId} `
   }


   let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }
    if(payLoad.customerId != undefined && payLoad.customerId != null){
        cluases +=  ` and acc.acc_id = ${payLoad.customerId} `
    }
 

   if(payLoad.locationId != undefined && payLoad.locationId != null){
    cluases +=  ` and acc.location_id = ${payLoad.locationId} `
   }
   let [errDebitorBalances,debitorBalances] =  await _p(db.query(`select acc.acc_name,acc.contact_no,acc.address,
       
        ( 
            select ifnull(sum(at.tran_amount),0) as rcv_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'receive'
                   and at.acc_type = 'debitor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as rcv_amount,

        ( 
            select ifnull(sum(at.tran_amount),0) as pay_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'payment'
                   and at.acc_type = 'debitor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as pay_amount,



        (
            select rcv_amount - pay_amount 
        ) as balance
        from tbl_accounts acc
        where acc.status = 'a' 
        and acc.party_type <> 'general'
        and acc.branch_id = ${req.user.user_branch_id}
        and acc.acc_type_id = 'debitor'
        ${cluases}

        order by acc.acc_name   asc `)).then(result=>{
        return result;
    });

    if(errDebitorBalances && !debitorBalances){
        next(errDebitorBalances)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {accounts      : debitorBalances}
    }

    let resFormat = {
        total_balance : debitorBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}

let getDebtorBalance = async(req,res,next)=>{
    let payLoad = req.body;
   let cluases = ` `
   if(payLoad.customerId != undefined && payLoad.customerId != null){
       cluases +=  ` and acc.acc_id = ${payLoad.customerId} `
   }


   if(payLoad.componentName != undefined && payLoad.componentName != null){
    cluases +=  ` and gp.component_name = '${payLoad.componentName}' `
   }

   if(payLoad.groupId != undefined && payLoad.groupId != null){
    cluases +=  ` and gp.group_id = ${payLoad.groupId} `
   }

   let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


   if(payLoad.locationId != undefined && payLoad.locationId != null){
    cluases +=  ` and acc.location_id = ${payLoad.locationId} `
   }

   if(req.body.page_size != undefined && req.body.page_number != undefined ){
    cluases += ` LIMIT ${req.body.page_size} OFFSET ${(req.body.page_number - 1) * req.body.page_size} `;
   }




   let [errDebitorBalances,debitorBalances] =  await _p(db.query(`select acc.acc_id,acc.acc_code,acc.group_id,acc.acc_name,acc.contact_no,acc.address,acc.credit_limit,
   ifnull( (
    select ifnull(sum(coll.amount),0) as collAmount from tbl_debtor_collections coll
           where coll.acc_id = acc.acc_id   
           ${ payLoad.toDate  != undefined ? ` and DATE(coll.created_date) = '${isoFromDate(payLoad.toDate)}' ` : ''}
           and coll.branch_id = ${req.user.user_branch_id}
   ),0) as collected_amount,

   ifnull( (
    select ifnull(sum(coll.amount),0) as collection_amount from tbl_debtor_collections coll
           where coll.acc_id = acc.acc_id  
            ${dateCluases != '' ? ` and coll.created_date ${dateCluases}` : ''}
           and coll.branch_id = ${req.user.user_branch_id}
   ),0) as collection_amount,

       (
    select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
           where aacc.status = 'a' and aacc.acc_id = acc.acc_id
       ) as curr_opening_balance,
        ( 
            select ifnull(sum(sm.total_amount),0) as sale_bill_amount
             from tbl_sales_master sm 
             where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id}
                   and sm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and sm.created_date ${dateCluases}` : ''}
        ) as sale_bill_amount,

        ( 
            select ifnull(sum(sm.paid_amount),0) as sale_received_amount
             from tbl_sales_master sm 
             where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id}
                   and sm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and sm.created_date ${dateCluases}` : ''}
        ) as sale_received_amount,


        ( 
            select ifnull(sum(svm.total_amount),0) as service_bill_amount
             from tbl_service_master svm 
             where svm.status = 'a' and svm.branch_id = ${req.user.user_branch_id}
                   and svm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and svm.created_date ${dateCluases}` : ''}
        ) as service_bill_amount,

        ( 
            select ifnull(sum(svm.paid_amount),0) as service_received_amount
             from tbl_service_master svm 
             where svm.status = 'a' and svm.branch_id = ${req.user.user_branch_id}
                   and svm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and svm.created_date ${dateCluases}` : ''}
        ) as service_received_amount,



        ( 
            select ifnull(sum(srm.total_amount),0) as return_amount
             from tbl_sales_return_master srm 
             where srm.status = 'a' and srm.branch_id = ${req.user.user_branch_id}
                   and srm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and srm.created_date ${dateCluases}` : ''}
        ) as return_amount,

        
        ( 
            select ifnull(sum(receipt.rcv_total),0) as rcv_total
             from tbl_debitor_receipt_details receipt
             left join tbl_debitor_receipts  dr on dr.rcv_id = receipt.rcv_id
             where receipt.status = 'a' 
                   and receipt.from_acc_id = acc.acc_id
                   and dr.status = 'a'
                   ${dateCluases != '' ? ` and dr.creation_date ${dateCluases}` : ''}
        ) as rcv_total,


        ( 
            select ifnull(sum(receipt.discount_amount),0) as discount_amount
             from tbl_debitor_receipt_details receipt
             left join tbl_debitor_receipts  dr on dr.rcv_id = receipt.rcv_id
             where receipt.status = 'a' 
                   and receipt.from_acc_id = acc.acc_id
                   and dr.status = 'a'
                   ${dateCluases != '' ? ` and dr.creation_date ${dateCluases}` : ''}
        ) as discount_amount,


        ( 
            select ifnull(sum(jd.debit_amount),0) as jrn_debit_total
             from tbl_journal_details jd
             left join tbl_journals  j on j.jrn_id = jd.jrn_id
             where jd.status = 'a' 
                   and jd.acc_id = acc.acc_id
                   and j.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
        ) as jrn_debit_total,

        ( 
            select ifnull(sum(jd.credit_amount),0) as jrn_credit_total
             from tbl_journal_details jd
             left join tbl_journals  j on j.jrn_id = jd.jrn_id
             where jd.status = 'a' 
                   and jd.acc_id = acc.acc_id
                   and j.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
        ) as jrn_credit_total,



        (
          select    sale_bill_amount + service_bill_amount 
        ) as total_bill_amount,
         
        (
            select jrn_credit_total + sale_received_amount + service_received_amount + rcv_total  + collection_amount
        ) as total_received_amount,

        (
            select jrn_debit_total
        ) as total_payment,

        (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,

           (
              select  ifnull(emi_month,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id and emi_month != 0 order by sale_id  desc limit 1
           ) as emi_month,
          

           (
            select  ifnull(day_week,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id and day_week != 0 order by sale_id  desc limit 1
         ) as day_week,

         (
            select  ifnull(count(*),0) from tbl_debtor_collections where  acc_id = acc.acc_id 
         ) as paid_day_week_month,

        (
            select   ( ifnull(curr_opening_balance,0) + total_bill_amount  + total_payment ) - (total_received_amount + return_amount + discount_amount)   
        ) as balance


        from tbl_accounts acc
        left join tbl_collection_groups gp on gp.group_id = acc.group_id
        where acc.status = 'a' 
        and acc.party_type <> 'general'
        and acc.branch_id = ${req.user.user_branch_id}
        and acc.acc_type_id = 'debitor'
        ${cluases}

         `)).then(result=>{
        return result;
    });

    // order by acc.acc_name   asc

    if(errDebitorBalances && !debitorBalances){
        next(errDebitorBalances)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {accounts      : debitorBalances}
    }

    let resFormat = {
        total_balance : debitorBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}


router.post(`/api/get-debitor-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
        let dateFrom = payLoad.dateFrom
        let dateTo = payLoad.dateTo
        let ledgerType = payLoad.ledgerType;

    let [debitorLedgerErr,debitorLedger] =  await _p(db.query(`
            select 
                '1' as sequence,
                 sm.sale_id as id,
                 sm.created_date as creation_date,
                 concat('Sales', ' - ',sm.narration) as particular,
                 sm.sale_voucher_no as vch_no,
                 'Sales' as vch_type,
                 ifnull(sm.total_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_sales_master sm
                 where sm.status = 'a' and sm.acc_id = ${payLoad.customerId}
                
                union select
                 '2' as sequence,
                 vt.voucher_id as id,
                 sm.created_date as creation_date,
                 concat('Sales VCH on  Received Into ', ' - ',acc.acc_name) as particular,
                 sm.sale_voucher_no as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(vt.tran_amount,0.00) as credit_amount
                
                 from tbl_voucher_transactions vt
                 left join tbl_sales_master sm on sm.sale_id = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
                 where vt.status = 'a' and vt.from_acc_id = ${payLoad.customerId} and vt.voucher_type = 'sale'

                 
                 union select
                 '3' as sequence,
                 srm.sale_r_id as id,
                 srm.created_date as creation_date,
                 concat('Sales Return') as particular,
                 srm.sale_r_voucher_no as vch_no,
                 'Sales Return' as vch_type,
                 0.00 as debit_amount,
                 ifnull(srm.total_amount,0.00) as credit_amount
                
                 from tbl_sales_return_master srm 
                 where srm.status = 'a'  and srm.acc_id = ${payLoad.customerId}
                


                 union select
                 '4' as sequence,
                 drd.rcv_id as id,
                 dr.creation_date as creation_date,
                 concat('Receipt  Into  ', ' - ',acc.acc_name,' - ',dr.narration) as particular,
                 dr.rcv_code as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(drd.rcv_total,0.00)  as credit_amount
                
                 from tbl_debitor_receipt_details drd
                 left join tbl_debitor_receipts dr on dr.rcv_id = drd.rcv_id
                 left join tbl_accounts acc on acc.acc_id = drd.into_acc_id
                 where dr.status = 'a' and drd.from_acc_id = ${payLoad.customerId} 

                
                
                union select
                 '5' as sequence,
                 sm.service_id as id,
                 sm.created_date as creation_date,
                 'Services' as particular,
                 sm.service_voucher_no as vch_no,
                 'Services' as vch_type,
                 ifnull(sm.total_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_service_master sm
                 where sm.status = 'a' and sm.acc_id = ${payLoad.customerId}

                 union select
                 '6' as sequence,
                 vt.voucher_id as id,
                 sm.created_date as creation_date,
                 concat('Services VCH on  Received Into ', ' - ',acc.acc_name) as particular,
                 sm.service_voucher_no as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(vt.tran_amount,0.00) as credit_amount
                 
                 from tbl_voucher_transactions vt
                 left join tbl_service_master sm on sm.service_id  = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
                 where vt.status = 'a' and vt.from_acc_id = ${payLoad.customerId} and vt.voucher_type = 'service'


                 union select
                 '7' as sequence,
                 jr.jrn_id as id,
                 jr.creation_date as creation_date,
                 'Payment To Customer ' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 ifnull(jd.debit_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on  jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.customerId} and jd.debit_amount != 0

                 union select
                 '8' as sequence,
                 jr.jrn_id as id,
                 jr.creation_date as creation_date,
                 'Received from Customer  ' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 0.00 as debit_amount,
                 ifnull(jd.credit_amount,0.00) as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.customerId} and jd.credit_amount != 0

                 union select
                 '9' as sequence,
                 drd.rcv_id as id,
                 dr.creation_date as creation_date,
                 concat('Discount  ', ' - ',dr.narration) as particular,
                 dr.rcv_code as vch_no,
                 'Discount' as vch_type,
                 0.00 as debit_amount,
                 ifnull(drd.discount_amount,0.00)  as credit_amount
                
                 from tbl_debitor_receipt_details drd
                 left join tbl_debitor_receipts dr on dr.rcv_id = drd.rcv_id
                 where drd.status = 'a' and drd.from_acc_id = ${payLoad.customerId} 
                 and drd.discount_amount != 0



                 union select
                 '10' as sequence,
                 col.coll_id as id,
                 col.created_date as creation_date,
                 concat('Collection  ') as particular,
                 '' as vch_no,
                 'Collection' as vch_type,
                 0.00 as debit_amount,
                 ifnull(col.amount,0.00)  as credit_amount
                
                 from tbl_debtor_collections col
                 where  col.acc_id = ${payLoad.customerId} 



                        
                 
                order by creation_date,sequence asc
         
         `)).then(result=>{
         return result;
     });


     if(debitorLedgerErr && !debitorLedger){
        next(debitorLedgerErr)
     }

     // Get Opening Balance
     let [customerErr,customer]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
     opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.customerId}`).then(cus=>{
        return cus;
    }));

    let opening_balance  = customer.opening_balance
    let closing_balance  = 0
    

    let newLedger = debitorLedger.map(async(value,index) => {
        let lastBalance  = index == 0 ? opening_balance : debitorLedger[index - 1].balance;
        // Details Add




        // End
        value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
        


        
        if(ledgerType == "with details" && value.vch_type == "Sales"){
            let text = "";

                let [itemDataErr,itemData] =  await _p(db.query(`select sd.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
                    (
                    select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
                    ) as base_unit_name,
                    u.unit_id,u.base_unit_id,
                    peru.unit_symbol as per_unit_symbol,
                    peru.conversion as per_conversion,
                    concat(it.item_name,' - ',it.item_barcode) as display_text,
                    w.warehouse_name,
                    discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name
        
                    from tbl_sales_details sd
                    left join tbl_warehouses w on w.warehouse_id  = sd.warehouse_id
                    left join tbl_accounts discount_acc on discount_acc.acc_id = sd.discount_acc_id
                    left join tbl_accounts tax_acc on tax_acc.acc_id = sd.tax_acc_id
                    left join tbl_items it on it.item_id = sd.item_id
                    left join tbl_item_units u on u.unit_id  = it.unit_id 
                    left join tbl_item_units peru on peru.unit_id  = sd.per_unit_id 
        
                    where  sd.status = 'a'
                    and sd.sale_id = ? 
                    `,[value.id])).then(res=>{
                    return res;
            });


        
             // start for Muiltiple Unit 
             itemData =  itemData.map((item)=>{
                let unitOne = [{
                    unit_symbol : item.unit_symbol,
                    conversion : item.conversion,
                    unit_id : item.unit_id
                }]
        
                let unitTwo = [{
                    unit_symbol : item.base_unit_name,
                    conversion : 1,
                    unit_id : item.base_unit_id
                }]
         
        
        
                item.units = item.conversion > 1 ? unitOne.concat(unitTwo) : unitOne
        
                return item
        
              })
        
            // end for Muiltiple Unit 
        
            
            itemData.map((item)=>{
                text += ' <p style="font-size:11px;margin:0px"> @Item : '+ item.item_name + ' @QTY : '+ item.sale_qty + ' @Rate : '+ item.item_rate + '@Total : '+ item.item_total +  "</p> "  
            })

 

            value.particular += text

        }



        if(ledgerType == "with details" && value.vch_type == "Sales Return"){
            let text = "";
   
                let [itemDataErr,itemData] =  await _p(db.query(`select srd.*,srd.sale_r_qty as sale_qty,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
                (
                select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
                ) as base_unit_name,
                u.unit_id,u.base_unit_id,
                peru.unit_symbol as per_unit_symbol,
                peru.conversion as per_conversion,
                concat(it.item_name,' - ',it.item_barcode) as display_text,
                w.warehouse_name,
                discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name
    
                from tbl_sales_return_details srd
                left join tbl_warehouses w on w.warehouse_id  = srd.warehouse_id
                left join tbl_accounts discount_acc on discount_acc.acc_id = srd.discount_acc_id
                left join tbl_accounts tax_acc on tax_acc.acc_id = srd.tax_acc_id
                left join tbl_items it on it.item_id = srd.item_id
                left join tbl_item_units u on u.unit_id  = it.unit_id 
                left join tbl_item_units peru on peru.unit_id  = srd.per_unit_id 
                where  srd.status = 'a'
                and srd.sale_r_id = ? 
                    `,[value.id])).then(res=>{
                    return res;
            });


        
             // start for Muiltiple Unit 
             itemData =  itemData.map((item)=>{
                let unitOne = [{
                    unit_symbol : item.unit_symbol,
                    conversion : item.conversion,
                    unit_id : item.unit_id
                }]
        
                let unitTwo = [{
                    unit_symbol : item.base_unit_name,
                    conversion : 1,
                    unit_id : item.base_unit_id
                }]
         
        
        
                item.units = item.conversion > 1 ? unitOne.concat(unitTwo) : unitOne
        
                return item
        
              })
        
            // end for Muiltiple Unit 
        
            
            itemData.map((item)=>{
                text += ' <p style="font-size:11px;margin:0px"> @Item : '+ item.item_name + ' @QTY : '+ item.sale_qty + ' @Rate : '+ item.item_rate + '@Total : '+ item.item_total +  "</p> "  
            })

 

            value.particular += text

        }
        
        
        return value;
    });



newLedger = await  Promise.all(newLedger)

    if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
        let prevTrans =  newLedger.filter((payment)=>{
             return payment.creation_date < dateFrom
         });
 
         opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
         
         newLedger =  newLedger.filter((payment)=>{
             return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
         });

     }


        if(newLedger.length > 0){
            closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
        }


     res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 })



 router.post(`/api/get-debitor-ledger-own`,async(req,res,next)=>{
    let payLoad = req.body;
        let dateFrom = payLoad.dateFrom
        let dateTo = payLoad.dateTo

      
    let [debitorLedgerErr,debitorLedger] =  await _p(db.query(`
            select 
                '1' as sequence,
                 sm.created_date as creation_date,
                 'Purchase' as particular,
                 sm.sale_voucher_no as vch_no,
                 'Purchase' as vch_type,
                 ifnull(sm.total_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_sales_master sm
                 where sm.status = 'a' and sm.acc_id = ${payLoad.customerId}
                
                union select
                 '2' as sequence,
                 sm.created_date as creation_date,
                 concat('Payment to  ', ' - ',acc.acc_name) as particular,
                 sm.sale_voucher_no as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(vt.tran_amount,0.00) as credit_amount
                
                 from tbl_voucher_transactions vt
                 left join tbl_sales_master sm on sm.sale_id = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
                 where vt.status = 'a' and vt.from_acc_id = ${payLoad.customerId} and vt.voucher_type = 'sale'

                 
                 union select
                 '3' as sequence,
                 srm.created_date as creation_date,
                 concat('Purchase Return') as particular,
                 srm.sale_r_voucher_no as vch_no,
                 'Sales Return' as vch_type,
                 0.00 as debit_amount,
                 ifnull(srm.total_amount,0.00) as credit_amount
                
                 from tbl_sales_return_master srm 
                 where srm.status = 'a'  and srm.acc_id = ${payLoad.customerId}
                


                 union select
                 '4' as sequence,
                 dr.creation_date as creation_date,
                 concat('Payment  to  ', ' - ',acc.acc_name) as particular,
                 dr.rcv_code as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(drd.rcv_total,0.00)  as credit_amount
                
                 from tbl_debitor_receipt_details drd
                 left join tbl_debitor_receipts dr on dr.rcv_id = drd.rcv_id
                 left join tbl_accounts acc on acc.acc_id = drd.into_acc_id
                 where drd.status = 'a' and drd.from_acc_id = ${payLoad.customerId} 

                
                
                union select
                 '5' as sequence,
                 sm.created_date as creation_date,
                 'Services' as particular,
                 sm.service_voucher_no as vch_no,
                 'Services' as vch_type,
                 ifnull(sm.total_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_service_master sm
                 where sm.status = 'a' and sm.acc_id = ${payLoad.customerId}

                 union select
                 '6' as sequence,
                 sm.created_date as creation_date,
                 concat('Services Payment  to ', ' - ',acc.acc_name) as particular,
                 sm.service_voucher_no as vch_no,
                 'Receipt' as vch_type,
                 0.00 as debit_amount,
                 ifnull(vt.tran_amount,0.00) as credit_amount
                 
                 from tbl_voucher_transactions vt
                 left join tbl_service_master sm on sm.service_id  = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
                 where vt.status = 'a' and vt.from_acc_id = ${payLoad.customerId} and vt.voucher_type = 'service'


                 union select
                 '7' as sequence,
                 jr.creation_date as creation_date,
                 'Payment Received ' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 ifnull(jd.debit_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on  jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.customerId} and jd.debit_amount != 0

                 union select
                 '8' as sequence,
                 jr.creation_date as creation_date,
                 'Payment to' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 0.00 as debit_amount,
                 ifnull(jd.credit_amount,0.00) as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.customerId} and jd.credit_amount != 0
                        
                 
                order by creation_date,sequence asc
         
         `)).then(result=>{
         return result;
     });

     if(debitorLedgerErr && !debitorLedger){
        next(debitorLedgerErr)
     }

     // Get Opening Balance
     let [customerErr,customer]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
     opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.customerId}`).then(cus=>{
        return cus;
    }));

    let opening_balance  = customer.opening_balance
    let closing_balance  = 0
    

    let newLedger = debitorLedger.map((value,index) => {
        let lastBalance  = index == 0 ? opening_balance : debitorLedger[index - 1].balance;
        value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
        return value;
    });



    if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
        let prevTrans =  newLedger.filter((payment)=>{
             return payment.creation_date < dateFrom
         });
 
         opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
         
         newLedger =  newLedger.filter((payment)=>{
             return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
         });

     }


        if(newLedger.length > 0){
            closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
        }


     res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 })



 let getCreditorBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ` `
    if(payLoad.supplierId != undefined && payLoad.supplierId != null){
        cluases +=  ` and acc.acc_id = ${payLoad.supplierId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [errCreditorBalances,creditorBalances] =  await _p(db.query(`select acc.acc_name,acc.contact_no,acc.address,
    (
        select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
               where aacc.status = 'a' and aacc.acc_id = acc.acc_id
           ) as curr_opening_balance,
   
         ( 
             select ifnull(sum(pm.total_amount),0) as pur_bill_amount
              from tbl_purchase_master pm 
              where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id}
                    and pm.acc_id = acc.acc_id
                    ${dateCluases != '' ? ` and pm.created_date  ${dateCluases}` : ''}
         ) as pur_bill_amount,
 
         ( 
             select ifnull(sum(pm.paid_amount),0) as pur_paid_amount
              from tbl_purchase_master pm 
              where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id}
                    and pm.acc_id = acc.acc_id
                    ${dateCluases != '' ? ` and pm.created_date  ${dateCluases}` : ''}
         ) as pur_paid_amount,
 
 
         ( 
             select ifnull(sum(sem.total_amount),0) as service_ex_bill_amount
              from tbl_service_expense_master sem 
              where sem.status = 'a' and sem.branch_id = ${req.user.user_branch_id}
                    and sem.acc_id = acc.acc_id
                    ${dateCluases != '' ? ` and sem.created_date  ${dateCluases}` : ''}
         ) as service_ex_bill_amount,
 
         ( 
             select ifnull(sum(sem.paid_amount),0) as service_paid_amount
              from tbl_service_expense_master sem 
              where sem.status = 'a' and sem.branch_id = ${req.user.user_branch_id}
                    and sem.acc_id = acc.acc_id
                    ${dateCluases != '' ? ` and sem.created_date  ${dateCluases}` : ''}
         ) as service_paid_amount,
 
 
         ( 
             select ifnull(sum(prm.total_amount),0) as return_amount
              from tbl_purchase_return_master prm 
              where prm.status = 'a' and prm.branch_id = ${req.user.user_branch_id}
                    and prm.acc_id = acc.acc_id
                    ${dateCluases != '' ? ` and  prm.created_date  ${dateCluases}` : ''}
         ) as return_amount,
 
         
         ( 
             select ifnull(sum(cpay.pay_total),0) as pay_total
              from tbl_creditor_pay_details cpay
              left join tbl_creditor_payments  cp on cp.pay_id = cpay.pay_id
              where  cpay.status='a' and  cpay.to_acc_id = acc.acc_id
              and cp.status = 'a'
              ${dateCluases != '' ? ` and  cp.creation_date  ${dateCluases}` : ''}
         ) as pay_total,
 
         ( 
             select ifnull(sum(jd.debit_amount),0) as jrn_debit_total
              from tbl_journal_details jd
              left join tbl_journals  j on j.jrn_id = jd.jrn_id
              where jd.status = 'a' 
                    and jd.acc_id = acc.acc_id
                    and j.status = 'a'
                    ${dateCluases != '' ? ` and  j.creation_date  ${dateCluases}` : ''}
         ) as jrn_debit_total,
 
         ( 
             select ifnull(sum(jd.credit_amount),0) as jrn_credit_total
              from tbl_journal_details jd
              left join tbl_journals  j on j.jrn_id = jd.jrn_id
              where jd.status = 'a' 
                    and jd.acc_id = acc.acc_id
                    and j.status = 'a'
                    ${dateCluases != '' ? ` and j.creation_date  ${dateCluases}` : ''}
         ) as jrn_credit_total,
 
 
         (
           select      pur_bill_amount + service_ex_bill_amount 
         ) as total_bill_amount,
           
         (
             select  jrn_debit_total  + pur_paid_amount + service_paid_amount + pay_total 
         ) as total_pay_amount,

         (
             select jrn_credit_total
         ) as received_total,
         (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
         (
             select  (ifnull(curr_opening_balance,0) + (total_bill_amount  + received_total ) ) - (total_pay_amount + return_amount)
         ) as balance
 
         
         from tbl_accounts acc
         where acc.status = 'a' 
         and acc.party_type <> 'general'
         and acc.branch_id = ${req.user.user_branch_id}
         and acc.acc_type_id = 'creditor'
         ${cluases}
 
         order by acc.acc_name   asc `)).then(result=>{
         return result;
     });
 
     if(errCreditorBalances && !creditorBalances){
         next(errCreditorBalances)
     }
 
     let rescluases = {}
 
     if(payLoad.type != 'head_total'){
         rescluases = {accounts      : creditorBalances}
     }
 
     let resFormat = {
         total_balance : creditorBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
         ...rescluases
     }
     return resFormat;
 }

 router.post(`/api/get-sundry-creditor-balance`,async(req,res,next)=>{
     let result = await getCreditorBalance(req,res,next)
     res.json(result)
 })
 


 router.post(`/api/get-creditor-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
        let dateFrom = payLoad.dateFrom
        let dateTo = payLoad.dateTo

      
    let [creditorLedgerErr,creditorLedger] =  await _p(db.query(`
            select 
                '1' as sequence,
                 pm.created_date as creation_date,
                 'Purchase' as particular,
                 pm.pur_voucher_no as vch_no,
                 'Purchase' as vch_type,
                 0.00 as debit_amount,
                 ifnull(pm.total_amount,0.00) as credit_amount
                
                 from tbl_purchase_master pm
                 where pm.status = 'a' and pm.acc_id = ${payLoad.supplierId}
                
                union select
                 '2' as sequence,
                 pm.created_date as creation_date,
                 concat('Purchase VCH on  Pay From ', ' - ',acc.acc_name) as particular,
                 pm.pur_voucher_no as vch_no,
                 'Payment' as vch_type,
                 ifnull(vt.tran_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from tbl_voucher_transactions vt
                 left join tbl_purchase_master pm on pm.pur_id = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.from_acc_id
                 where vt.status = 'a' and vt.to_acc_id = ${payLoad.supplierId} and vt.voucher_type = 'purchase'


                 union select
                 '3' as sequence,
                 prm.created_date as creation_date,
                 concat('Purchase Return') as particular,
                 prm.pur_r_voucher_no as vch_no,
                 'Purchase Return' as vch_type,
                 ifnull(prm.total_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                
                 from  tbl_purchase_return_master prm 
                 where prm.status = 'a' and prm.acc_id = ${payLoad.supplierId}


                 union select
                 '4' as sequence,
                 cp.creation_date as creation_date,
                 concat('Payment From  ', ' - ',acc.acc_name,' - ',cp.narration) as particular,
                 cp.pay_code as vch_no,
                 'Payment' as vch_type,
                 ifnull(cpd.pay_total,0.00) as debit_amount,
                 0.00  as credit_amount
                
                 from tbl_creditor_pay_details cpd
                 left join tbl_creditor_payments cp on cp.pay_id  = cpd.pay_id
                 left join tbl_accounts acc on acc.acc_id = cpd.from_acc_id
                 where cpd.status = 'a' and cpd.to_acc_id = ${payLoad.supplierId} 
                
                union select
                 '5' as sequence,
                 sem.created_date as creation_date,
                 'Services Expense' as particular,
                 sem.service_ex_voucher_no as vch_no,
                 'Services' as vch_type,
                 0.00 as debit_amount,
                 ifnull(sem.total_amount,0.00) as credit_amount
                
                 from tbl_service_expense_master sem
                 where sem.status = 'a' and sem.acc_id = ${payLoad.supplierId}

                 union select
                 '6' as sequence,
                 sem.created_date as creation_date,
                 concat('Service Expense VCH on  Pay From ', ' - ',acc.acc_name) as particular,
                 sem.service_ex_voucher_no as vch_no,
                 'Payment' as vch_type,
                 ifnull(vt.tran_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                 
                 from tbl_voucher_transactions vt
                 left join tbl_service_expense_master sem on sem.service_ex_id   = vt.voucher_id
                 left join tbl_accounts acc on acc.acc_id = vt.from_acc_id
                 where vt.status = 'a' and vt.to_acc_id = ${payLoad.supplierId} and vt.voucher_type = 'service_expense'


                 union select
                 '7' as sequence,
                 jr.creation_date as creation_date,
                 'Payment To Supplier ' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 ifnull(jd.debit_amount,0.00) as debit_amount,
                 0.00 as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on  jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.supplierId} and jd.debit_amount != 0

                 union select
                 '8' as sequence,
                 jr.creation_date as creation_date,
                 'Received from Supplier  ' as particular,
                 jr.jrn_code as vch_no,
                 'Journal' as vch_type,
                 0.00 as debit_amount,
                 ifnull(jd.credit_amount,0.00) as credit_amount
                 
                 from tbl_journal_details jd
                 left join tbl_journals jr on jr.jrn_id = jd.jrn_id
                 where jd.status = 'a' and jd.acc_id = ${payLoad.supplierId} and jd.credit_amount != 0
                        
                 
                order by creation_date,sequence asc
         
         `)).then(result=>{
         return result;
     });

     if(creditorLedgerErr && !creditorLedger){
        next(creditorLedgerErr)
     }

     // Get Opening Balance
     let [supplierErr,supplier]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
     opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.supplierId}`).then(cus=>{
        return cus;
    }));

    let opening_balance  = supplier.opening_balance
    let closing_balance  = 0
    

    let newLedger = creditorLedger.map((value,index) => {
        let lastBalance  = index == 0 ? opening_balance : creditorLedger[index - 1].balance;
        value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
        return value;
    });



    if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
        let prevTrans =  newLedger.filter((payment)=>{
             return payment.creation_date < dateFrom
         });
 
         opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
         
         newLedger =  newLedger.filter((payment)=>{
             return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
         });

     }


        if(newLedger.length > 0){
            closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
        }


        res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 router.post(`/api/get-accounts-balance`,async(req,res,next)=>{
    let result = await getAccountBalance(req,res,next);
     res.json(result);
 });

 let getAccountBalance = async(req,res,next)=>{
    let payLoad = req.body;

    let cluases = ``
    

    if(payLoad.accId != undefined && payLoad.accId != null){
        cluases +=  ` and acc.acc_id = ${payLoad.accId} `
    }
    
    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    
    
    let [balancesErr,balances] =  await _p(db.query(` select acc.acc_name,acc.acc_type_id,
        (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
            where aacc.status = 'a' and aacc.acc_id = acc.acc_id
        ) as curr_opening_balance,
        (
            select ifnull(sum(vt.tran_amount),0) as sold_received_amount
                   from tbl_voucher_transactions vt 
                   left join tbl_sales_master  sm on sm.sale_id = vt.voucher_id 
                   where vt.status = 'a' and vt.to_acc_id = acc.acc_id
                   and vt.voucher_type= 'sale'
                   and sm.status = 'a'
                   ${dateCluases != '' ? ` and sm.created_date ${dateCluases}` : ''}
                   
        ) as sold_received_amount,
 

        (
            select ifnull(sum(vt.tran_amount),0) as service_received_amount
                   from tbl_voucher_transactions vt 
                   left join tbl_service_master  sm on sm.service_id = vt.voucher_id
                   where vt.status = 'a' and vt.to_acc_id = acc.acc_id
                   and vt.voucher_type= 'service'
                   and sm.status = 'a'
                   ${dateCluases != '' ? ` and sm.created_date  ${dateCluases}` : ''}
        ) as service_received_amount,
        (
            select ifnull(sum(vt.tran_amount),0) as service_expense_amount
                   from tbl_voucher_transactions vt 
                   left join tbl_service_expense_master  sem on sem.service_ex_id = vt.voucher_id
                   where vt.status = 'a' and vt.from_acc_id = acc.acc_id
                   and vt.voucher_type= 'service_expense'
                   and sem.status = 'a'
                   ${dateCluases != '' ? ` and sem.created_date ${dateCluases}` : ''}
        ) as service_expense_amount,

        (
            select ifnull(sum(vt.tran_amount),0) as purchase_pay_amount
                   from tbl_voucher_transactions vt 
                   left join tbl_purchase_master  pm on pm.pur_id = vt.voucher_id
                   where vt.status = 'a' and vt.from_acc_id = acc.acc_id
                   and vt.voucher_type= 'purchase'
                   and pm.status = 'a'
                   ${dateCluases != '' ? ` and pm.created_date  ${dateCluases}` : ''}
        ) as purchase_pay_amount,

     

        (
            select ifnull(sum(ct.pay_total),0) as creditor_pay_total
                   from tbl_creditor_pay_details ct 
                   left join tbl_creditor_payments  cp on cp.pay_id = ct.pay_id
                   where ct.status = 'a' and ct.from_acc_id = acc.acc_id
                   and cp.status = 'a'
                   ${dateCluases != '' ? ` and cp.creation_date  ${dateCluases}` : ''}
                  
        ) as creditor_pay_total,

        (
            select ifnull(sum(cr.rcv_total),0) as debitor_received_total
                   from tbl_debitor_receipt_details cr 
                   left join tbl_debitor_receipts  dr on dr.rcv_id = cr.rcv_id
                   where cr.status = 'a' and cr.into_acc_id = acc.acc_id
                   and dr.status = 'a'
                   ${dateCluases != '' ? ` and dr.creation_date  ${dateCluases}` : ''}
                  
        ) as debitor_received_total,

        (
            select ifnull(sum(e.exp_total),0) as expense_total
                   from tbl_expenses e
                   left join tbl_expenses  ep on ep.exp_id = e.exp_id
                   where e.status = 'a' and e.from_acc_id = acc.acc_id
                   and ep.status = 'a'
                   ${dateCluases != '' ? ` and ep.creation_date  ${dateCluases}` : ''}
        ) as expense_total,

        (
            select ifnull(sum(ic.inc_total),0) as income_total
                   from tbl_incomes ic
                   where ic.status = 'a' and ic.into_acc_id = acc.acc_id
                   and ic.status = 'a'
                   ${dateCluases != '' ? ` and ic.creation_date  ${dateCluases}` : ''}
                  
        ) as income_total,

        (
            select ifnull(sum(ct.tran_amount),0) as contra_transfer_total
                   from tbl_contra_trans ct
                   where ct.status = 'a' and ct.from_acc_id = acc.acc_id
                   and ct.status = 'a'
                   ${dateCluases != '' ? ` and ct.creation_date  ${dateCluases}` : ''}
                  
        ) as contra_transfer_total,

        (
            select ifnull(sum(ct.tran_amount),0) as contra_received_total
                   from tbl_contra_trans ct
                   where ct.status = 'a' and ct.to_acc_id = acc.acc_id
                   and ct.status = 'a'
                   ${dateCluases != '' ? ` and ct.creation_date  ${dateCluases}` : ''}
                  
        ) as contra_received_total,

        (
            select ifnull(sum(jt.debit_amount),0) as debit_amount_total
                   from tbl_journal_details jt
                   left join tbl_journals  j on j.jrn_id = jt.jrn_id
                   where jt.status = 'a' and jt.acc_id = acc.acc_id
                   and j.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date  ${dateCluases}` : ''}
                  
        ) as debit_amount_total,

        (
            select ifnull(sum(jt.credit_amount),0) as credit_amount_total
                   from tbl_journal_details jt
                   left join tbl_journals  j on j.jrn_id = jt.jrn_id
                   where jt.status = 'a' and jt.acc_id = acc.acc_id
                   and jt.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date  ${dateCluases}` : ''}
        ) as credit_amount_total,

        (
            select ifnull(sum(emp.pay_total),0) as employee_pay_total
                   from tbl_employee_pays emp
                   where emp.status = 'a' and emp.from_acc_id = acc.acc_id
                   and emp.status = 'a'
                   ${dateCluases != '' ? ` and emp.creation_date  ${dateCluases}` : ''}
        ) as employee_pay_total,



        ( 
            select ifnull(sum(bt.tran_amount),0) as tran_amount
             from tbl_branch_transactions bt 
             where bt.status = 'a' and bt.from_branch_id = ${req.user.user_branch_id}
             and bt.from_acc_id = acc.acc_id
                   
                   ${dateCluases != '' ? ` and bt.tran_date ${dateCluases}` : ''}
        ) as transferAmountBranch,

        ( 
            select ifnull(sum(bt.tran_amount),0) as tran_amount
             from tbl_branch_transactions bt 
             where bt.status = 'a' and bt.to_branch_id =  ${req.user.user_branch_id}
             and bt.to_acc_id = acc.acc_id
                   
                   ${dateCluases != '' ? ` and bt.tran_date ${dateCluases}` : ''}
        ) as receivedAmountBranch,


        ( 
            select ifnull(sum(at.tran_amount),0) as d_rcv_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.tran_acc_id = acc.acc_id
                   and at.tran_type = 'receive'
                   and at.acc_type = 'debitor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as d_rcv_amount,

        ( 
            select ifnull(sum(at.tran_amount),0) as d_pay_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.tran_acc_id = acc.acc_id
                   and at.tran_type = 'payment'
                   and at.acc_type = 'debitor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as d_pay_amount,


        ( 
            select ifnull(sum(at.tran_amount),0) as c_rcv_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.tran_acc_id = acc.acc_id
                   and at.tran_type = 'receive'
                   and at.acc_type = 'creditor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as c_rcv_amount,

        ( 
            select ifnull(sum(at.tran_amount),0) as c_pay_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.tran_acc_id = acc.acc_id
                   and at.tran_type = 'payment'
                   and at.acc_type = 'creditor'
                   ${dateCluases != '' ? ` and at.tran_date ${dateCluases}` : ''}
        ) as c_pay_amount,
        

        ifnull( (
            select ifnull(sum(coll.amount),0) as collection_amount from tbl_debtor_collections coll
                   where coll.into_acc_id = acc.acc_id  
                    ${dateCluases != '' ? ` and coll.created_date ${dateCluases}` : ''}
                   and coll.branch_id = ${req.user.user_branch_id}
           ),0) as collection_amount,

        (
            select   sold_received_amount + service_received_amount  + debitor_received_total +
                   income_total + contra_received_total + debit_amount_total  + receivedAmountBranch
                   + d_rcv_amount + c_rcv_amount + collection_amount
           ) as received_total,
           

        (
         select   service_expense_amount + purchase_pay_amount
                + creditor_pay_total + expense_total  + credit_amount_total + employee_pay_total +
                 contra_transfer_total + transferAmountBranch
                 + d_pay_amount + c_pay_amount
        ) as payment_total,

        (
          select ifnull(curr_opening_balance,0) as opening_balance
        ) as opening_balance,
        
        (
           select ifnull(curr_opening_balance,0) + (received_total - payment_total) 
        ) as balance
        

        from tbl_accounts acc
        where acc.status = 'a'
        and acc.acc_type_id in (${payLoad.accType})
        and acc.branch_id = ${req.user.user_branch_id}


        ${cluases}

        order by acc.acc_type_id desc
     `).then(res=>res));

     if(balancesErr && !balances){
        return next(balancesErr)
     }

     let rescluases = {}
 
     if(payLoad.type != 'head_total'){
         rescluases = {accounts      : balances}
     }
 
     let resFormat = {
         total_balance : balances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
         ...rescluases
     }
    return resFormat;
 }



 router.post(`/api/get-account-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom
    let dateTo = payLoad.dateTo
    
    let [ledgerErr,ledger] = await _p(db.query(` select 
        '1' as sequence,
        sm.created_date as creation_date,
        concat('Sales - ',acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Receipt' as vch_type,
        ifnull(vt.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_sales_master sm on sm.sale_id    = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sm.acc_id
        where vt.status = 'a' and vt.to_acc_id = ${payLoad.accId} and vt.voucher_type = 'sale'

       

        union select 
        '3' as sequence,
        pm.created_date as creation_date,
        concat('Purchase -  ',acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(vt.tran_amount,0.00)  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_purchase_master pm on pm.pur_id    = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = pm.acc_id
        where vt.status = 'a' and vt.from_acc_id = ${payLoad.accId} and vt.voucher_type = 'purchase'

      

        union select 
        '5' as sequence,
        sm.created_date as creation_date,
        concat('Service  - ',acc.acc_name) as particular,
        sm.service_voucher_no as vch_no,
        'Receipt' as vch_type,
        ifnull(vt.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_service_master sm on sm.service_id     = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sm.acc_id
        where vt.status = 'a' and vt.to_acc_id = ${payLoad.accId} and vt.voucher_type = 'service'

        union select 
        '6' as sequence,
        sem.created_date as creation_date,
        concat('Service Expense - ',acc.acc_name) as particular,
        sem.service_ex_voucher_no as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(vt.tran_amount,0.00)  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_service_expense_master sem on sem.service_ex_id     = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sem.acc_id
        where vt.status = 'a' and vt.from_acc_id = ${payLoad.accId} and vt.voucher_type = 'service_expense'


        union select 
        '7' as sequence,
        cpay.creation_date as creation_date,
        concat('Payment to Creditor from  ',acc.acc_name) as particular,
        cpay.pay_code as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(cpayd.pay_total,0.00)  as credit_amount

        from tbl_creditor_pay_details cpayd
        left join tbl_creditor_payments cpay on cpay.pay_id = cpayd.pay_id 
        left join tbl_accounts acc on acc.acc_id    = cpayd.from_acc_id
        
        where cpayd.status = 'a' and cpayd.from_acc_id = ${payLoad.accId} 

        union select 
        '8' as sequence,
        dr.creation_date as creation_date,
        concat('Received from ',acc.acc_name) as particular,
        dr.rcv_code as vch_no,
        'Receipt' as vch_type,
        ifnull(drd.rcv_total,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_debitor_receipt_details drd
        left join tbl_debitor_receipts dr on dr.rcv_id  = drd.rcv_id 
        left join tbl_accounts acc on acc.acc_id    = drd.from_acc_id 
        where dr.status = 'a' and drd.into_acc_id = ${payLoad.accId} 


        union select 
        '9' as sequence,
        exp.creation_date as creation_date,
        concat(acc.acc_name,' ', exp.narration) as particular,
        exp.exp_code as vch_no,
        'Expense' as vch_type,
        0.00 as debit_amount,
        ifnull(expd.exp_amount,0.00)  as credit_amount
        
        from tbl_expense_details expd
        left join tbl_expenses exp on  exp.exp_id = expd.exp_id
        left join tbl_accounts acc on acc.acc_id    = expd.to_acc_id 

        where exp.status = 'a' and exp.from_acc_id = ${payLoad.accId} 


        union select 
        '10' as sequence,
        inc.creation_date as creation_date,
        concat(acc.acc_name, inc.narration) as particular,
        inc.inc_code as vch_no,
        'Income' as vch_type,
        ifnull(incd.inc_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_income_details incd
        left join tbl_incomes inc on  inc.inc_id = incd.inc_id
        left join tbl_accounts acc on acc.acc_id    = incd.from_acc_id 
        where inc.status = 'a' and inc.into_acc_id = ${payLoad.accId} 



        union select 
        '11' as sequence,
        ct.creation_date as creation_date,
        concat('In Amount from  ',acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        ifnull(ct.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.from_acc_id
        where ct.status = 'a' and ct.to_acc_id = ${payLoad.accId} 

        union select 
        '12' as sequence,
        ct.creation_date as creation_date,
        concat('Out Amount to ',acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        0.00  as debit_amount,
        ifnull(ct.tran_amount,0.00)  as credit_amount
        
        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.to_acc_id
        where ct.status = 'a' and ct.from_acc_id = ${payLoad.accId} 



        union select 
        '13' as sequence,
        jr.creation_date as creation_date,
        concat('In Amount') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jrd.debit_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        where jrd.status = 'a' and jrd.credit_amount = '0' and jrd.acc_id = ${payLoad.accId} 


        union select 
        '14' as sequence,
        jr.creation_date as creation_date,
        concat('Out Amount') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        0.00 as debit_amount,
        ifnull(jrd.credit_amount,0.00)  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        where jrd.status = 'a' and jrd.debit_amount = '0' and jrd.acc_id = ${payLoad.accId} 


        union select 
        '15' as sequence,
        epay.creation_date as creation_date,
        concat('Payment To Employee ') as particular,
        epay.pay_code as vch_no,
        'Employee Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(epay.pay_total,0.00)  as credit_amount
        
        from tbl_employee_pays epay

        where epay.status = 'a' and epay.from_acc_id = ${payLoad.accId} 

        union  select 

        '16' as sequence,
        bt.tran_date as creation_date,
        concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
        bt.tran_code as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(bt.tran_amount,0.00) as credit_amount
       
        from tbl_branch_transactions bt
        left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
        left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

        where bt.status = 'a' and bt.from_branch_id =${req.user.user_branch_id}
        and bt.from_acc_id = ${payLoad.accId} 

        union  select 

        '17' as sequence,
        bt.tran_date as creation_date,
        concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
        bt.tran_code as vch_no,
        'Receipt' as vch_type,
        ifnull(bt.tran_amount,0.00)  as debit_amount,
        0.00 as credit_amount
       
        from tbl_branch_transactions bt
        left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
        left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

        where bt.status = 'a' and bt.to_branch_id = ${req.user.user_branch_id}
        and bt.to_acc_id = ${payLoad.accId} 

        union select 
        '18' as sequence,
        at.tran_date as creation_date,
        concat('Receive From  ',acc.acc_name,' to ',accTran.acc_name) as particular,
        '---' as vch_no,
        at.tran_type as vch_type,
        ifnull(at.tran_amount,0.00)  as debit_amount,
        0.00 as credit_amount
        from tbl_advance_transactions  at 
        left join tbl_accounts acc on acc.acc_id = at.acc_id
        left join tbl_accounts accTran on accTran.acc_id = at.tran_acc_id
        where at.tran_status = 'a' 
        and at.branch_id = ${req.user.user_branch_id}
        and at.tran_acc_id = ${payLoad.accId} 
        and at.tran_type = 'receive'
        and at.acc_type = 'debitor'


        union select 
        '19' as sequence,
        at.tran_date as creation_date,
        concat('Payment to  ',acc.acc_name,' from ',accTran.acc_name) as particular,
        '---' as vch_no,
        at.tran_type as vch_type,
        0.00  as debit_amount,
        ifnull(at.tran_amount,0.00) as credit_amount
        from tbl_advance_transactions  at 
        left join tbl_accounts acc on acc.acc_id = at.acc_id
        left join tbl_accounts accTran on accTran.acc_id = at.tran_acc_id
        where at.tran_status = 'a' 
        and at.branch_id = ${req.user.user_branch_id}
        and at.tran_acc_id = ${payLoad.accId} 
        and at.tran_type = 'payment'
        and at.acc_type = 'debitor'


        union select 
        '20' as sequence,
        at.tran_date as creation_date,
        concat('Payment to  ',acc.acc_name,' from ',accTran.acc_name) as particular,
        '---' as vch_no,
        at.tran_type as vch_type,
        0.00  as debit_amount,
        ifnull(at.tran_amount,0.00) as credit_amount
        from tbl_advance_transactions  at 
        left join tbl_accounts acc on acc.acc_id = at.acc_id
        left join tbl_accounts accTran on accTran.acc_id = at.tran_acc_id
        where at.tran_status = 'a' 
        and at.branch_id = ${req.user.user_branch_id}
        and at.tran_acc_id = ${payLoad.accId} 
        and at.tran_type = 'payment'
        and at.acc_type = 'creditor'

        union select 
        '21' as sequence,
        at.tran_date as creation_date,
        concat('Receive From  ',acc.acc_name,' to ',accTran.acc_name) as particular,
        '---' as vch_no,
        at.tran_type as vch_type,
        ifnull(at.tran_amount,0.00)  as debit_amount,
        0.00 as credit_amount
        from tbl_advance_transactions  at 
        left join tbl_accounts acc on acc.acc_id = at.acc_id
        left join tbl_accounts accTran on accTran.acc_id = at.tran_acc_id
        where at.tran_status = 'a' 
        and at.branch_id = ${req.user.user_branch_id}
        and at.tran_acc_id = ${payLoad.accId} 
        and at.tran_type = 'receive'
        and at.acc_type = 'creditor'


        
        union select
        '22' as sequence,
        col.created_date as creation_date,
        concat('Collection  ') as particular,
        '' as vch_no,
        'Collection' as vch_type,
        ifnull(col.amount,0.00) as debit_amount,
        0.00 as credit_amount
       
        from tbl_debtor_collections col
        where  col.into_acc_id = ${payLoad.accId}
        and col.branch_id = ${req.user.user_branch_id}



        
        order by creation_date,sequence asc


    `).then(res=>res));

    if(ledgerErr && !ledger){ return next(ledgerErr)};




       // Get Opening Balance
       let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
       opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
          return cus;
      }));
  
      let opening_balance  = account.opening_balance
      let closing_balance  = 0
      
  
      let newLedger = ledger.map((value,index) => {
          let lastBalance  = index == 0 ? opening_balance : ledger[index - 1].balance;
          value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
          return value;
      });
  
  
  
      if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
          let prevTrans =  newLedger.filter((payment)=>{
               return payment.creation_date < dateFrom
           });
   
           opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
           
           newLedger =  newLedger.filter((payment)=>{
               return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
           });
  
       }
  
  
          if(newLedger.length > 0){
              closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
          }
  
  
          res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });








 router.post(`/api/get-daily-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom
    let dateTo = payLoad.dateTo
    
    let [ledgerErr,ledger] = await _p(db.query(` select 
        vt.tran_id as sequence,
        sm.created_date as creation_date,
        concat('Sales - ',acc.acc_name, ' - ', accTo.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Receipt' as vch_type,
        ifnull(vt.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_sales_master sm on sm.sale_id    = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sm.acc_id
        left join tbl_accounts accTo on accTo.acc_id    = vt.to_acc_id
        where vt.status = 'a'  and vt.voucher_type = 'sale'
        and sm.branch_id = ${req.user.user_branch_id}
      

        union select 
        vt.tran_id as sequence,
        pm.created_date as creation_date,
        concat('Purchase -  ',acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(vt.tran_amount,0.00)  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_purchase_master pm on pm.pur_id    = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = pm.acc_id
        where vt.status = 'a'  and vt.voucher_type = 'purchase'
        and pm.branch_id = ${req.user.user_branch_id}

      

        union select 
        vt.tran_id as sequence,
        sm.created_date as creation_date,
        concat('Service  - ',acc.acc_name) as particular,
        sm.service_voucher_no as vch_no,
        'Receipt' as vch_type,
        ifnull(vt.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_service_master sm on sm.service_id     = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sm.acc_id
        where vt.status = 'a'  and vt.voucher_type = 'service'

        and sm.branch_id = ${req.user.user_branch_id}

        union select 
        vt.tran_id as sequence,
        sem.created_date as creation_date,
        concat('Service Expense - ',acc.acc_name) as particular,
        sem.service_ex_voucher_no as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(vt.tran_amount,0.00)  as credit_amount

        from tbl_voucher_transactions vt
        left join tbl_service_expense_master sem on sem.service_ex_id     = vt.voucher_id
        left join tbl_accounts acc on acc.acc_id    = sem.acc_id
        where vt.status = 'a'  and vt.voucher_type = 'service_expense'
        and sem.branch_id = ${req.user.user_branch_id}


        union select 
        '7' as sequence,
        cpay.creation_date as creation_date,
        concat('Payment to Creditor from  ',acc.acc_name,' - ',cpay.narration) as particular,
        cpay.pay_code as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(cpayd.pay_total,0.00)  as credit_amount

        from tbl_creditor_pay_details cpayd
        left join tbl_creditor_payments cpay on cpay.pay_id = cpayd.pay_id 
        left join tbl_accounts acc on acc.acc_id    = cpayd.from_acc_id
        
        where cpayd.status = 'a' 
        and cpay.branch_id = ${req.user.user_branch_id}

        union select 
        '8' as sequence,
        dr.creation_date as creation_date,
        concat('Received from ',' - ',acc.acc_name,' - ',ifnull(dr.narration,''),drd.rcv_d_id) as particular,
        dr.rcv_code as vch_no,
        'Receipt' as vch_type,
        ifnull(drd.rcv_total,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_debitor_receipt_details drd
        left join tbl_debitor_receipts dr on dr.rcv_id  = drd.rcv_id 
        left join tbl_accounts acc on acc.acc_id    = drd.from_acc_id 
        where dr.status = 'a' 
        and dr.branch_id = ${req.user.user_branch_id}


        union select 
        '9' as sequence,
        exp.creation_date as creation_date,
        concat(acc.acc_name,' - ', exp.narration) as particular,
        exp.exp_code as vch_no,
        'Expense' as vch_type,
        0.00 as debit_amount,
        ifnull(expd.exp_amount,0.00)  as credit_amount
        
        from tbl_expense_details expd
        left join tbl_expenses exp on  exp.exp_id = expd.exp_id
        left join tbl_accounts acc on acc.acc_id    = expd.to_acc_id 
        
        where expd.status = 'a' 
        and expd.branch_id = ${req.user.user_branch_id}


        union select 
        '10' as sequence,
        inc.creation_date as creation_date,
        concat(acc.acc_name, inc.narration) as particular,
        inc.inc_code as vch_no,
        'Income' as vch_type,
        ifnull(incd.inc_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_income_details incd
        left join tbl_incomes inc on  inc.inc_id = incd.inc_id
        left join tbl_accounts acc on acc.acc_id    = incd.from_acc_id 
        where inc.status = 'a' 
        and inc.branch_id = ${req.user.user_branch_id}



        union select 
        '11' as sequence,
        ct.creation_date as creation_date,
        concat('Out from  ',acc.acc_name, ' - ',ct.narration) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        0.00 as debit_amount,
        ifnull(ct.tran_amount,0.00)  as credit_amount
        
        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.from_acc_id
        where ct.status = 'a' and acc.acc_type_id IN ("cash_in_hand","bank_account")

        and ct.branch_id = ${req.user.user_branch_id}


        union select 
        '12' as sequence,
        ct.creation_date as creation_date,
        concat('Into ',acc.acc_name, ' - ',ct.narration) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        ifnull(ct.tran_amount,0.00)  as debit_amount,
        0.00  as credit_amount
        
        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.to_acc_id
        where ct.status = 'a' and acc.acc_type_id IN ("cash_in_hand","bank_account")

        and ct.branch_id = ${req.user.user_branch_id}


        union select 
        '13' as sequence,
        jr.creation_date as creation_date,
        concat('In Amount') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jrd.debit_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        left join tbl_accounts acc on acc.acc_id = jrd.acc_id
        where jrd.status = 'a' and jrd.credit_amount = '0' 
        
        and acc.acc_type_id IN ("cash_in_hand","bank_account")
        and jr.branch_id = ${req.user.user_branch_id}

        


        union select 
        '14' as sequence,
        jr.creation_date as creation_date,
        concat('Out Amount') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        0.00 as debit_amount,
        ifnull(jrd.credit_amount,0.00)  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        left join tbl_accounts acc on acc.acc_id = jrd.acc_id

        where jrd.status = 'a' and jrd.debit_amount = '0' 
        and acc.acc_type_id IN ("cash_in_hand","bank_account")

        and jr.branch_id = ${req.user.user_branch_id}

        union select 
        '15' as sequence,
        epay.creation_date as creation_date,
        concat('Payment To Employee ') as particular,
        epay.pay_code as vch_no,
        'Employee Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(epay.pay_total,0.00)  as credit_amount
        
        from tbl_employee_pays epay

        where epay.status = 'a' 
        and epay.branch_id = ${req.user.user_branch_id}

        union  select 

        '16' as sequence,
        bt.tran_date as creation_date,
        concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
        bt.tran_code as vch_no,
        'Payment' as vch_type,
        0.00 as debit_amount,
        ifnull(bt.tran_amount,0.00) as credit_amount
       
        from tbl_branch_transactions bt
        left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
        left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

        where bt.status = 'a' and bt.from_branch_id =${req.user.user_branch_id}

        union  select 

        '17' as sequence,
        bt.tran_date as creation_date,
        concat('From Acc - ',accFrom.acc_name, ' , To Acc - ',accTo.acc_name) as particular,
        bt.tran_code as vch_no,
        'Receipt' as vch_type,
        ifnull(bt.tran_amount,0.00)  as debit_amount,
        0.00 as credit_amount
       
        from tbl_branch_transactions bt
        left join tbl_accounts accTo on accTo.acc_id = bt.to_acc_id
        left join tbl_accounts accFrom on accFrom.acc_id = bt.from_acc_id

        where bt.status = 'a' and bt.to_branch_id = ${req.user.user_branch_id}


        union select
        '18' as sequence,
        col.created_date as creation_date,
        concat('Collection  ') as particular,
        '' as vch_no,
        'Collection' as vch_type,
        ifnull(col.amount,0.00) as debit_amount,
        0.00 as credit_amount
       
        from tbl_debtor_collections col
        where  col.branch_id = ${req.user.user_branch_id}


        order by creation_date,sequence asc


    `).then(res=>res));

    if(ledgerErr && !ledger){ return next(ledgerErr)};


 
       // Get Opening Balance
       let [accountErr,account]  = await _p(db.query(`select sum(opening_balance) as 
       opening_balance from tbl_accounts  where 
 status = 'a' and branch_id = ?   and  acc_type_id IN ("cash_in_hand","bank_account")  `,[req.user.user_branch_id]).then(cus=>{
          return cus;
      }));


  
      let opening_balance  = account[0].opening_balance == null ? 0 : account[0].opening_balance 
      let closing_balance  = 0
      
  
      let newLedger = ledger.map((value,index) => {
          let lastBalance  = index == 0 ? opening_balance : ledger[index - 1].balance;
          value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
          return value;
      });
  
  
  
      if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
          let prevTrans =  newLedger.filter((payment)=>{
               return payment.creation_date < dateFrom
           });
   
           opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
           
           newLedger =  newLedger.filter((payment)=>{
               return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
           });
  
       }
  
  
          if(newLedger.length > 0){
              closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
          }
  
  
          res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 router.post(`/api/get-capital-balance`,async(req,res,next)=>{
     let  result = await  getCapitalBalance(req,res,next)
     res.json(result);
 });

 let getCapitalBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;  

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

        
   let dateCluases = ''
   if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
       dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
   }


    let [capitalsErr,capitals] = await _p(db.query(`
         select acc.acc_name, (
           select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                  where aacc.status = 'a' and aacc.acc_id = acc.acc_id
              ) as curr_opening_balance,
         (
           select ifnull(sum(ct.tran_amount),0) as contra_received_total
               from tbl_contra_trans ct
               where ct.status = 'a' and ct.to_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
         ) as contra_received_total,
         (
           select ifnull(sum(ct.tran_amount),0) as contra_transfer_total
               from tbl_contra_trans ct
               where ct.status = 'a' and ct.from_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
         ) as contra_transfer_total,

         (
           select ifnull(sum(jt.debit_amount),0) as debit_amount_total
                from tbl_journal_details jt
                left join tbl_journals  j on j.jrn_id = jt.jrn_id
                where jt.status = 'a' and jt.acc_id = acc.acc_id
                and j.status = 'a'
                ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
         ) as debit_amount_total,
         
         (
           select ifnull(sum(jt.credit_amount),0) as credit_amount_total
                from tbl_journal_details jt
                left join tbl_journals  j on j.jrn_id = jt.jrn_id
                where jt.status = 'a' and jt.acc_id = acc.acc_id
                and j.status = 'a'
                ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
         ) as credit_amount_total,

         (
           select ifnull(curr_opening_balance,0) as opening_balance
          ) as opening_balance,

         (
             select   contra_received_total + debit_amount_total
         ) as received_total,

         (
           select  ifnull(curr_opening_balance,0) + credit_amount_total + contra_transfer_total
         ) as investment_total,

         (
             select   investment_total - received_total
         ) as balance

         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id in ('investment','capital')
         ${cluases}

    `).then(res=>res));

    if(capitalsErr && !capitals){
       return next(capitalsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {capitals      : capitals}
    }

    let resFormat = {
        total_balance : capitals.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat;
 }


 router.post(`/api/get-capital-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [contrasErr,contras] =   await _p(db.query(` 
      select 

        '1' as sequence,
        ct.creation_date as creation_date,
        concat('Received From ',acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        ifnull(ct.tran_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on  acc.acc_id = ct.from_acc_id
        where ct.status = 'a' and ct.to_acc_id = ${payLoad.accId} 

        union select
        '2' as sequence,
        ct.creation_date as creation_date,
        concat('Investment To ',acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        0.00 as debit_amount,
        ifnull(ct.tran_amount,0.00)  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.to_acc_id
        where ct.status = 'a' and ct.from_acc_id = ${payLoad.accId} 

        union select 
        '3' as sequence,
        jr.creation_date as creation_date,
        concat('Received') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jrd.debit_amount,0.00) as debit_amount,
        0.00  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        where jrd.status = 'a' and jrd.credit_amount = '0' and jrd.acc_id = ${payLoad.accId} 

        union select 
        '4' as sequence,
        jr.creation_date as creation_date,
        concat('Investment') as particular,
        jr.jrn_code as vch_no,
        'Journal' as vch_type,
        0.00 as debit_amount,
        ifnull(jrd.credit_amount,0.00)  as credit_amount
        
        from tbl_journal_details jrd
        left join tbl_journals jr on jr.jrn_id  = jrd.jrn_id 
        where jrd.status = 'a' and jrd.debit_amount = '0' and jrd.acc_id = ${payLoad.accId} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(contrasErr && !contras){ return next(contrasErr)}


      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = contras.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : contras[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
 
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });

 let getIndirectExpenseBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [expensesErr,expenses] = await _p(db.query(`
         select acc.acc_name, (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,       
         (
           select ifnull(sum(exp.exp_amount),0) as expense_total
               from tbl_expense_details exp
               left join tbl_expenses  em on em.exp_id = exp.exp_id
               where exp.status = 'a' and exp.to_acc_id = acc.acc_id
               and em.status = 'a'
               ${dateCluases != '' ? ` and em.creation_date ${dateCluases}` : ''}
         ) as expense_total,
         
         (
            select ifnull(sum(epay.pay_total),0) as salary_expense_total
                from tbl_employee_pays epay
                where epay.status = 'a' and epay.salary_acc_id = acc.acc_id
                and epay.from_acc_id != 0
                ${dateCluases != '' ? ` and epay.creation_date ${dateCluases}` : ''}
          ) as salary_expense_total,

          (
            select ifnull(sum(jd.debit_amount),0) as debit_amount
                from tbl_journal_details jd
                left join tbl_journals  j on j.jrn_id = jd.jrn_id
                where jd.status = 'a' and jd.acc_id = acc.acc_id
                      and jd.credit_amount = 0
                      ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
          ) as jrn_debit_amount,

          (
            select ifnull(sum(jd.credit_amount),0) as credit_amount
                from tbl_journal_details jd
                left join tbl_journals  j on j.jrn_id = jd.jrn_id
                where jd.status = 'a' and jd.acc_id = acc.acc_id
                      and jd.debit_amount = 0
                      ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
          ) as jrn_credit_amount,


          (
            select expense_total + salary_expense_total + jrn_debit_amount
          ) as debit_amount,

          (
            select jrn_credit_amount
          ) as credit_amount,

          (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
        
         (
             select   (ifnull(curr_opening_balance,0) + debit_amount) - credit_amount
         ) as balance

         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'indirect_expense'
         ${cluases}

    `).then(res=>res));

    if(expensesErr && !expenses){
       return next(expensesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {expenses      : expenses}
    }

    let resFormat = {
        total_balance : expenses.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat;
 }


 router.post(`/api/get-indirect-expense-balance`,async(req,res,next)=>{
    let result = await getIndirectExpenseBalance(req,res,next)
    res.json(result);
});


router.post(`/api/get-indirect-expense-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        expm.creation_date as creation_date,
        concat('Expense from ',acc.acc_name, ' , ' ,expm.narration) as particular,
        expm.exp_code as vch_no,
        'Expense' as vch_type,
        ifnull(exp.exp_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_expense_details exp
        left join tbl_expenses expm on  expm.exp_id  = exp.exp_id
        left join tbl_accounts acc on  acc.acc_id = expm.from_acc_id

        where exp.status = 'a' and exp.to_acc_id = ${payLoad.accId} 

        union select
        '2' as sequence,
        epay.creation_date as creation_date,
        concat('Salary Payment From ',acc.acc_name) as particular,
        epay.pay_code as vch_no,
        'Expense' as vch_type,
        ifnull(epay.pay_total,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_employee_pays epay
        left join tbl_accounts acc on  acc.acc_id = epay.from_acc_id

        where epay.status = 'a' and epay.salary_acc_id = ${payLoad.accId} 
        and epay.from_acc_id != 0



        union select 
        '3' as sequence,
        jrnm.creation_date as creation_date,
        concat('Expense for ',acc.acc_name) as particular,
        jrnm.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jrd.debit_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_journal_details jrd
        left join tbl_journals jrnm on  jrnm.jrn_id  = jrd.jrn_id
        left join tbl_accounts acc on  acc.acc_id = jrd.acc_id

        where jrd.status = 'a' 
        and jrd.credit_amount = 0
        and jrd.acc_id = ${payLoad.accId} 


      



        order by creation_date,sequence asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}


      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : expenses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
 
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });



 let getIndirectIncomeBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [incomesErr,incomes] = await _p(db.query(`
         select acc.acc_name,
         (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,       
         (
           select ifnull(sum(inc.inc_amount),0) as inc_amount_total
               from tbl_income_details inc
               left join tbl_incomes  inm on inm.inc_id = inc.inc_id
               where inc.status = 'a' and inc.from_acc_id = acc.acc_id
               and inm.status='a'
               ${dateCluases != '' ? ` and inm.creation_date ${dateCluases}` : ''}
         ) as inc_amount_total,
         (
            select 0
         ) as debit_amount,
         (
            select inc_amount_total
         ) as credit_amount,

         (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
          
        
         (
             select   (ifnull(curr_opening_balance,0) + credit_amount) - debit_amount
         ) as balance

         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'indirect_income'
         ${cluases}

    `).then(res=>res));

    if(incomesErr && !incomes){
       return next(incomesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {incomes      : incomes}
    }

    let resFormat = {
        total_balance : incomes.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat;
 }

 
 router.post(`/api/get-indirect-income-balance`,async(req,res,next)=>{
    let result = await getIndirectIncomeBalance(req,res,next);
    res.json(result);
});


router.post(`/api/get-indirect-income-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [incomesErr,incomes] =   await _p(db.query(` 
      select 

        '1' as sequence,
        incm.creation_date as creation_date,
        concat('Income Received Into  ',acc.acc_name) as particular,
        incm.inc_code as vch_no,
        'Income' as vch_type,
        0.00 as debit_amount,
        ifnull(inc.inc_amount,0.00)  as credit_amount

        from tbl_income_details inc
        left join tbl_incomes incm on  incm.inc_id  = inc.inc_id
        left join tbl_accounts acc on  acc.acc_id = incm.into_acc_id

        where inc.status = 'a' and inc.from_acc_id = ${payLoad.accId} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(incomesErr && !incomes){ return next(incomesErr)}


      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = incomes.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : incomes[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
 
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });


 let getSalesBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

     

        let dateCluases = ''
        if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
            dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
        }


    let [salesErr,sales] = await _p(db.query(`
         select acc.acc_name,
         (
           select ifnull((sum(sm.total_amount) + sum(sm.total_discount)) - ifnull(sum(sm.total_tax) + sum(sm.total_transport_cost),0),0) as sold_amount_total
               from tbl_sales_master sm
               where sm.status = 'a' and sm.sales_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and sm.created_date ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
         
         and acc.acc_type_id = 'sale_account'
         ${cluases}

    `).then(res=>res));

    if(salesErr && !sales){
       return next(salesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {sales      : sales}
    }

    let resFormat = {
        total_balance : sales.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
    
 }


 router.post(`/api/get-sales-balance`,async(req,res,next)=>{
    let result =  await getSalesBalance(req,res,next)
    res.json(result);
});


let getSalesReturnBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [salesReturnErr,salesReturn] = await _p(db.query(`
         select acc.acc_name,
         (
           select ifnull((sum(srm.total_amount) + sum(srm.total_discount)) - sum(srm.total_tax),0) as sale_return_amount
               from tbl_sales_return_master srm
               where srm.status = 'a' and srm.sales_return_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and srm.created_date ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'sale_return'
               
         ${cluases}

    `).then(res=>res));

    if(salesReturnErr && !salesReturn){
       return next(salesReturnErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {sales_return      : salesReturn}
    }

    let resFormat = {
        total_balance : salesReturn.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }

    return resFormat
}


router.post(`/api/get-sales-return-balance`,async(req,res,next)=>{
    let result = await getSalesReturnBalance(req,res,next)
    res.json(result);
});

let getPurchaseBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

     let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }



    let [purchasesErr,purchases] = await _p(db.query(`
         select acc.acc_name,
         
         (
           select ifnull((sum(pm.total_amount) + sum(pm.total_discount)) - ifnull(sum(pm.total_tax) + sum(pm.total_transport_cost),0),0) as purchase_amount_total
               from tbl_purchase_master pm
               where pm.status = 'a' and pm.purchase_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and pm.created_date ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'purchase_account'
         ${cluases}

    `).then(res=>res));

    if(purchasesErr && !purchases){
       return next(purchasesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {purchase      : purchases}
    }

    let resFormat = {
        total_balance : purchases.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
  return resFormat;
}

router.post(`/api/get-purchase-balance`,async(req,res,next)=>{
    let result = await getPurchaseBalance(req,res,next)
    res.json(result);
});

let getPurchaseReturnBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [returnsErr,returns] = await _p(db.query(`
         select acc.acc_name,
         (
           select ifnull((sum(prm.total_amount) + sum(prm.total_discount)) - sum(prm.total_tax) ,0) as purchase_return_total
               from tbl_purchase_return_master prm
               where prm.status = 'a' and prm.purchase_return_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and prm.created_date  ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'purchase_return'
         ${cluases}

    `).then(res=>res));

    if(returnsErr && !returns){
       return next(returnsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {returns      : returns}
    }

    let resFormat = {
        total_balance : returns.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }

    return resFormat;
}

router.post(`/api/get-purchase-return-balance`,async(req,res,next)=>{

    let result = await getPurchaseReturnBalance(req,res,next);
    res.json(result);
});


let getServiceBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [servicesErr,services] = await _p(db.query(`
         select acc.acc_name,
         (
           select ifnull((sum(sm.total_amount) + sum(sm.total_discount)) - sum(sm.total_tax),0) as service_total
               from tbl_service_master sm
               where sm.status = 'a' and sm.services_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and sm.created_date  ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'service_account'
         ${cluases}

    `).then(res=>res));

    if(servicesErr && !services){
       return next(servicesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {services      : services}
    }

    let resFormat = {
        total_balance : services.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}

router.post(`/api/get-service-balance`,async(req,res,next)=>{
   
    let result = await getServiceBalance(req,res,next)
    res.json(result);
});

let getServiceExpenseBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [expensesErr,expenses] = await _p(db.query(`
         select acc.acc_name,
         (
           select ifnull((sum(sem.total_amount) + sum(sem.total_discount)) - sum(sem.total_tax),0) as service_total
               from tbl_service_expense_master sem
               where sem.status = 'a' and sem.service_ex_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and sem.created_date ${dateCluases}` : ''}
         ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'service_expense_account'
         ${cluases}

    `).then(res=>res));

    if(expensesErr && !expenses){
       return next(expensesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {expenses      : expenses}
    }

    let resFormat = {
        total_balance : expenses.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }

    return resFormat
}

router.post(`/api/get-service-expense-balance`,async(req,res,next)=>{
    
    let result = await getServiceExpenseBalance(req,res,next)
    res.json(result);
});




router.post(`/api/get-sales-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [salesErr,sales] =   await _p(db.query(` 
      select 

        '1' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Sales' as vch_type,
        0.00 as debit_amount,
        ifnull(sm.total_amount - sm.total_transport_cost,0.00)  as credit_amount

        from tbl_sales_master sm
        left join tbl_accounts acc on acc.acc_id = sm.acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(salesErr && !sales){ return next(salesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = sales.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : sales[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
 
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });


 router.post(`/api/get-sales-return-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [salesReturnErr,salesReturn] =   await _p(db.query(` 
      select 

        '1' as sequence,
        srm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        srm.sale_r_voucher_no as vch_no,
        'Sales Return' as vch_type,
        ifnull(srm.total_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_sales_return_master srm
        left join tbl_accounts acc on acc.acc_id = srm.acc_id
        where srm.status = 'a' and srm.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(salesReturnErr && !salesReturn){ return next(salesReturnErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = salesReturn.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : salesReturn[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
 
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });


 router.post(`/api/get-purchase-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [purchsesErr,purchses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        pm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Purchase' as vch_type,
        ifnull(pm.total_amount - pm.total_transport_cost,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_purchase_master pm
        left join tbl_accounts acc on acc.acc_id = pm.acc_id
        where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(purchsesErr && !purchses){ return next(purchsesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = purchses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : purchses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });


 router.post(`/api/get-purchase-return-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [purchsesErr,purchses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        prm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        prm.pur_r_voucher_no as vch_no,
        'Purchase Return' as vch_type,
        0.00 as debit_amount,
        ifnull(prm.total_amount,0.00)  as credit_amount

        from tbl_purchase_return_master prm
        left join tbl_accounts acc on acc.acc_id = prm.acc_id
        where prm.status = 'a' and prm.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(purchsesErr && !purchses){ return next(purchsesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = purchses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : purchses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

});


 router.post(`/api/get-service-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [purchsesErr,purchses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.service_voucher_no as vch_no,
        'Service' as vch_type,
        0.00 as debit_amount,
        ifnull(sm.total_amount,0.00)  as credit_amount

        from tbl_service_master sm
        left join tbl_accounts acc on acc.acc_id = sm.acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(purchsesErr && !purchses){ return next(purchsesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = purchses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : purchses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })

 });

 router.post(`/api/get-service-expense-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        sem.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sem.service_ex_voucher_no as vch_no,
        'Service Expense' as vch_type,
        ifnull(sem.total_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_service_expense_master sem
        left join tbl_accounts acc on acc.acc_id = sem.acc_id
        where sem.status = 'a' and sem.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : expenses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 router.post(`/api/get-tax-balance`,async(req,res,next)=>{
   
    let result = await getTaxBalance(req,res,next)
    res.json(result);
});

let getTaxBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [taxsErr,taxs] = await _p(db.query(`
         select acc.acc_name, (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,
         (
           select ifnull(sum(pm.total_tax),0) as purchase_tax_total
               from tbl_purchase_master pm
               where pm.status = 'a' and pm.tax_acc_id = acc.acc_id
               ${dateCluases != '' ? ` and pm.created_date ${dateCluases}` : ''}
         ) as purchase_tax_total,

         (
            select ifnull(sum(prm.total_tax),0) as purchase_return_tax_total
                from tbl_purchase_return_master prm
                where prm.status = 'a' and prm.tax_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and prm.created_date ${dateCluases}` : ''}
          ) as purchase_return_tax_total,

          (
            select ifnull(sum(sm.total_tax),0) as sale_tax_total
                from tbl_sales_master sm
                where sm.status = 'a' and sm.tax_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and   sm.created_date ${dateCluases}` : ''}
          ) as sale_tax_total,

      


          (
            select ifnull(sum(srm.total_tax),0) as sale_return_tax_total
                from tbl_sales_return_master srm
                where srm.status = 'a' and srm.tax_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and   srm.created_date ${dateCluases}` : ''}
          ) as sale_return_tax_total,

          (
            select ifnull(sum(sm.total_tax),0) as service_tax_total
                from tbl_service_master sm
                where sm.status = 'a' and sm.tax_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and   sm.created_date ${dateCluases}` : ''}
          ) as service_tax_total,

          (
            select ifnull(sum(sem.total_tax),0) as service_exp_tax_total
                from tbl_service_expense_master sem
                where sem.status = 'a' and sem.tax_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and   sem.created_date ${dateCluases}` : ''}
          ) as service_exp_tax_total,

          (
            select purchase_tax_total + sale_return_tax_total + service_exp_tax_total
          ) as debit_taxs,

          (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
          
          

          (
            select ifnull(curr_opening_balance,0) + purchase_return_tax_total + sale_tax_total + service_tax_total
          ) as credit_taxs,
        
         (
             select    credit_taxs -  debit_taxs
         ) as balance
         
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'dutie_&_tax'
         ${cluases}

    `).then(res=>res));

    if(taxsErr && !taxs){
       return next(taxsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {taxs      : taxs}
    }

    let resFormat = {
        total_balance : taxs.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}

router.post(`/api/get-due-purchase-vouchers`,async(req,res,next)=>{
    let [vouchersErr,vouchers] = await _p(db.query(` select pm.pur_voucher_no as voucher_no
        from tbl_purchase_master pm 
        where pm.status = 'a' and pm.acc_id = ${req.body.supplierId} 
    `).then(res=>res))
    if(vouchersErr && !vouchers){
        return next(vouchersErr)
    }
    res.json(vouchers)
});

router.post(`/api/get-due-sales-vouchers`,async(req,res,next)=>{
    let [vouchersErr,vouchers] = await _p(db.query(` 
    SELECT
    voucher_no,
    total_amount,
    paid_amount,
    partialPaid,
    discountAmount,
    paid,
    due,
    CONCAT(
        voucher_no,
        ' - Bill : ',
        total_amount,
        ' - Discount : ',
        discountAmount,
        ' - Curr Due: ',
        (total_amount - (paid_amount + partialPaid) - discountAmount),
        IF(is_condition_sale = 'yes', ' - Cond Sale', '')
    ) AS display_text,
    (due - discountAmount) as due
FROM (
    SELECT
        sm.sale_voucher_no AS voucher_no,
        sm.total_amount,
        sm.paid_amount,
        IFNULL((SELECT SUM(dr.rcv_total) FROM tbl_debitor_receipt_details dr WHERE dr.voucher_no = sm.sale_voucher_no AND dr.status = 'a'), 0) AS partialPaid,
        IFNULL((SELECT SUM(dr.discount_amount) FROM tbl_debitor_receipt_details dr WHERE dr.voucher_no = sm.sale_voucher_no AND dr.status = 'a'), 0) AS discountAmount,
        (sm.paid_amount + IFNULL((SELECT SUM(dr.rcv_total) FROM tbl_debitor_receipt_details dr WHERE dr.voucher_no = sm.sale_voucher_no AND dr.status = 'a'), 0)) AS paid,
        (sm.total_amount - (sm.paid_amount + IFNULL((SELECT SUM(dr.rcv_total) FROM tbl_debitor_receipt_details dr WHERE dr.voucher_no = sm.sale_voucher_no AND dr.status = 'a'), 0))) AS due,
        sm.is_condition_sale
    FROM
        tbl_sales_master sm
    WHERE
        sm.status = 'a' AND sm.acc_id = ${req.body.customerId}
        order by sm.sale_id desc
) AS tbl
WHERE
    due != 0;

    
    
    
        
    `).then(res=>res))
    if(vouchersErr && !vouchers){
        return next(vouchersErr)
    }
    res.json(vouchers)
});


router.post(`/api/get-tax-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [taxsErr,taxs] =   await _p(db.query(` 
      select 

        '1' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Sales' as vch_type,
        0.00 as debit_amount,
        ifnull(sm.total_tax,0.00)  as credit_amount

        from tbl_sales_master sm
        left join tbl_accounts acc on acc.acc_id = sm.acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 
        

        union select
        '2' as sequence,
        srm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        srm.sale_r_voucher_no as vch_no,
        'Sales Return' as vch_type,
        ifnull(srm.total_tax,0.00) as debit_amount,
        0.00 as credit_amount

        from tbl_sales_return_master srm
        left join tbl_accounts acc on acc.acc_id = srm.acc_id
        where srm.status = 'a' and srm.branch_id = ${req.user.user_branch_id} 


        union select
        '3' as sequence,
        pm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Purchase' as vch_type,
        ifnull(pm.total_tax,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_purchase_master pm
        left join tbl_accounts acc on acc.acc_id = pm.acc_id
        where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id} 

        union select
        '4' as sequence,
        prm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        prm.pur_r_voucher_no as vch_no,
        'Purchase Return' as vch_type,
        0.00 as debit_amount,
        ifnull(prm.total_tax,0.00)  as credit_amount

        from tbl_purchase_return_master prm
        left join tbl_accounts acc on acc.acc_id = prm.acc_id
        where prm.status = 'a' and prm.branch_id = ${req.user.user_branch_id} 

        union select
        '5' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.service_voucher_no as vch_no,
        'Service' as vch_type,
        0.00 as debit_amount,
        ifnull(sm.total_tax,0.00)  as credit_amount

        from tbl_service_master sm
        left join tbl_accounts acc on acc.acc_id = sm.acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 

        union select
        '6' as sequence,
        sem.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sem.service_ex_voucher_no as vch_no,
        'Service Expense' as vch_type,
        ifnull(sem.total_tax,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_service_expense_master sem
        left join tbl_accounts acc on acc.acc_id = sem.acc_id
        where sem.status = 'a' and sem.branch_id = ${req.user.user_branch_id} 

        order by creation_date,sequence asc

    `).then(res=>res));

    if(taxsErr && !taxs){ return next(taxsErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = taxs.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : taxs[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });

 let getDirectExpenseBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [expensesErr,expenses] = await _p(db.query(`
         select acc.acc_name,(
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,       
          (
            select ifnull(sum(prm.total_discount),0) as purchase_return_discount_total
                from tbl_purchase_return_master prm
                where prm.status = 'a' and prm.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and prm.created_date  ${dateCluases}` : ''}
          ) as purchase_return_discount_total,

          (
            select ifnull(sum(sm.total_discount),0) as sale_discount_total
                from tbl_sales_master sm
                where sm.status = 'a' and sm.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and sm.created_date  ${dateCluases}` : ''}
          ) as sale_discount_total,

          (
            select ifnull(sum(sm.total_discount),0) as service_discount_total
                from tbl_service_master sm
                where sm.status = 'a' and sm.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and sm.created_date  ${dateCluases}` : ''}
          ) as service_discount_total,


          (
            select ifnull(sum(pm.total_transport_cost),0) as service_discount_total
                from tbl_purchase_master pm
                where pm.status = 'a' and pm.transport_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and pm.created_date  ${dateCluases}` : ''}
          ) as purchase_transport_cost_total,


          (
            select ifnull(sum(dd.discount_amount),0) as discount_amount
                from tbl_debitor_receipt_details dd
                left join tbl_debitor_receipts d on d.rcv_id = dd.rcv_id
                where dd.status = 'a' and dd.direct_income_id = acc.acc_id
                ${dateCluases != '' ? ` and d.creation_date  ${dateCluases}` : ''}
          ) as discount_amount,




          (
            select purchase_return_discount_total + sale_discount_total + service_discount_total + purchase_transport_cost_total +  discount_amount
          ) as debit_amount,
          (
            select 0
          ) as credit_amount,

            (
                select ifnull(curr_opening_balance,0) as opening_balance
            ) as opening_balance,

          (
            select (ifnull(curr_opening_balance,0) + debit_amount) - credit_amount
          ) as balance
         
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'direct_expense'
         ${cluases}

    `).then(res=>res));

    if(expensesErr && !expenses){
       return next(expensesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {expenses      : expenses}
    }

    let resFormat = {
        total_balance : expenses.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
 }

 router.post(`/api/get-direct-expense-balance`,async(req,res,next)=>{
    let result = await getDirectExpenseBalance(req,res,next)
    res.json(result);
});

 router.post(`/api/get-direct-expense-balance`,async(req,res,next)=>{
    let result = await getDirectExpenseBalance(req,res,next)
    res.json(result);
});

router.post(`/api/get-direct-expense-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Sales' as vch_type,
        ifnull(sm.total_discount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_sales_master sm
        left join tbl_accounts acc on acc.acc_id = sm.discount_acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 
        

        union select
        '2' as sequence,
        prm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        prm.pur_r_voucher_no as vch_no,
        'Purchase' as vch_type,
        ifnull(prm.total_discount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_purchase_return_master prm
        left join tbl_accounts acc on acc.acc_id = prm.discount_acc_id
        where prm.status = 'a' and prm.branch_id = ${req.user.user_branch_id} 

        union select
        '3' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.service_voucher_no as vch_no,
        'Service' as vch_type,
        ifnull(sm.total_discount,0.00)  as debit_amount,
        0.00  as credit_amount

        from tbl_service_master sm
        left join tbl_accounts acc on acc.acc_id = sm.discount_acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 


        union select
        '4' as sequence,
        pm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Transport Cost on Purchse' as vch_type,
        ifnull(pm.total_transport_cost,0.00)  as debit_amount,
        0.00  as credit_amount

        from tbl_purchase_master pm
        left join tbl_accounts acc on acc.acc_id = pm.transport_acc_id
        where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id} 
     

        order by creation_date,sequence asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : expenses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 let getDirectIncomeBalance = async(req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    
    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [incomesErr,incomes] = await _p(db.query(`
         select acc.acc_name, (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,
       
         (
            select ifnull(sum(pm.total_discount),0) as purchase_discount_total
                from tbl_purchase_master pm
                where pm.status = 'a' and pm.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and pm.created_date  ${dateCluases}` : ''}
          ) as purchase_discount_total,

          (
            select ifnull(sum(srm.total_discount),0) as sale_return_discount_total
                from tbl_sales_return_master srm
                where srm.status = 'a' and srm.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and srm.created_date  ${dateCluases}` : ''}
          ) as sale_return_discount_total,

          (
            select ifnull(sum(sem.total_discount),0) as service_expense_total
                from tbl_service_expense_master sem
                where sem.status = 'a' and sem.discount_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and sem.created_date  ${dateCluases}` : ''}
          ) as service_expense_total,

          (
            select ifnull(sum(sm.total_transport_cost),0) as total_transport_cost
                from tbl_sales_master sm
                where sm.status = 'a' and sm.transport_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and sm.created_date  ${dateCluases}` : ''}
          ) as sales_transport_cost_total,


       


          (
             select  0
          ) as debit_amount,

          (
            select  purchase_discount_total + sale_return_discount_total + service_expense_total + sales_transport_cost_total
          ) as credit_amount,

           (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,          

          (
            select (ifnull(curr_opening_balance,0) + credit_amount) - debit_amount
          ) as balance
         
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'direct_income'
         ${cluases}

    `).then(res=>res));

    if(incomesErr && !incomes){
       return next(incomesErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {incomes      : incomes}
    }

    let resFormat = {
        total_balance : incomes.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
 }

 router.post(`/api/get-direct-income-balance`,async(req,res,next)=>{
    let result = await getDirectIncomeBalance(req,res,next)
    res.json(result);
});


 router.post(`/api/get-direct-income-balance`,async(req,res,next)=>{
    let result = await getDirectIncomeBalance(req,res,next)
    res.json(result);
});


router.post(`/api/get-direct-income-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    

  let [incomesErr,incomes] =   await _p(db.query(` 
      select 

        '1' as sequence,
        srm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        srm.sale_r_voucher_no as vch_no,
        'Sales Return' as vch_type,
        0.00 as debit_amount,
        ifnull(srm.total_discount,0.00)  as credit_amount

        from tbl_sales_return_master srm
        left join tbl_accounts acc on acc.acc_id = srm.discount_acc_id
        where srm.status = 'a' and srm.branch_id = ${req.user.user_branch_id} 
        

        union select
        '2' as sequence,
        pm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Purchase' as vch_type,
        0.00 as debit_amount,
        ifnull(pm.total_discount,0.00)  as credit_amount

        from tbl_purchase_master pm
        left join tbl_accounts acc on acc.acc_id = pm.discount_acc_id
        where pm.status = 'a' and pm.branch_id = ${req.user.user_branch_id} 

        union select
        '3' as sequence,
        sem.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sem.service_ex_voucher_no as vch_no,
        'Service Expense' as vch_type,
        0.00  as debit_amount,
        ifnull(sem.total_discount,0.00)  as credit_amount

        from tbl_service_expense_master sem
        left join tbl_accounts acc on acc.acc_id = sem.discount_acc_id
        where sem.status = 'a' and sem.branch_id = ${req.user.user_branch_id} 


        union select
        '4' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Transport Cost on Sales' as vch_type,
        0.00  as debit_amount,
        ifnull(sm.total_transport_cost,0.00)  as credit_amount

        from tbl_sales_master sm
        left join tbl_accounts acc on acc.acc_id = sm.transport_acc_id
        where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id} 



     

        order by creation_date,sequence asc

    `).then(res=>res));

    if(incomesErr && !incomes){ return next(incomesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = incomes.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : incomes[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.credit_amount) ) - parseFloat(value.debit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 let getStockValue = async(req,res,next)=>{

        let stock = await getStock(req,res,next,0,'no',req.user.user_branch_id,0);

        let getStockValue =  stock.reduce((prev,curr)=>{
            return prev+parseFloat(curr.stock_value)
        },0)
        return getStockValue
 }


 let getOpeningBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    
    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [openingsAssetsErr,openingsAssets] = await _p(db.query(`
          select ifnull(sum(acc.opening_balance),0) as assets_opening_balance
            from tbl_accounts acc 
            where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
            and acc.acc_type_id in ('cash_in_hand','bank_account','debitor','current_asset','fixed_asset','loan_&_advance','deposit')
    `).then(res=>res));

    if(openingsAssetsErr && !openingsAssets){
       return next(openingsAssetsErr)
    }

    let [openingStockErr,openingStockAssets] = await _p(db.query(`
    select ifnull(sum(it.opening_qty * it.opening_rate),0) as opening_stock_value
      from tbl_items it  
      where it.status = 'a'      
      and find_in_set(${req.user.user_branch_id},it.branch_ids) 
`).then(res=>res));

if(openingStockErr && !openingStockAssets){
 return next(openingStockErr)
}


    let [openingsLiabilitiesErr,openingsLiabilities] = await _p(db.query(`select ifnull(sum(acc.opening_balance),0) as liabilities_opening_balance
           from tbl_accounts acc 
           where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
           and acc.acc_type_id in ('creditor','capital','current_liability','current_asset','investment','dutie_&_tax','loan')
         
`).then(res=>res));



if(openingsLiabilitiesErr && !openingsLiabilities){
   return next(openingsLiabilitiesErr)
}
    let resFormat = {
        total_balance : (openingsAssets[0].assets_opening_balance + openingStockAssets[0].opening_stock_value) - openingsLiabilities[0].liabilities_opening_balance,
    }
    return resFormat
    
 }


 router.post(`/api/get-opening-balance`,async(req,res,next)=>{
    req.body.type = 'head_total'
    let result =  await getOpeningBalance(req,res,next)
    res.json(result);
});

let getProfitLoss = async(req,res,next)=>{
    let result = {}
    let debitAmount  =  0;
    let creditAmount  =  0;
    
    let grossProfitAmount  =  0;
    
    let debitTotal  =  0;
    let creditTotal  =  0;
    
    let netProfit = 0;
    let getting;
    
    getting =  await getSalesBalance(req,res,next);
    result.salesBalance = getting.total_balance;
    
    getting =  await   getTransferBalance(req,res,next);
    result.productTransferBalance = getting.total_balance;
    
    
    getting =  await   getTransferReceiveBalance(req,res,next);
    result.productTransferReceivedBalance = getting.total_balance;
    

    
    
    
    
    
    
    getting =  await getSalesReturnBalance(req,res,next);
    result.salesReturnBalance = getting.total_balance;
    
    getting =  await getPurchaseBalance(req,res,next);
    result.purchaseBalance = getting.total_balance;
    
    getting =  await getPurchaseReturnBalance(req,res,next);
    result.purchaseReturnBalance = getting.total_balance;
    
    getting =  await getDirectIncomeBalance(req,res,next);
    result.directIncomeBalance = getting.total_balance;
    
    getting =  await getDirectExpenseBalance(req,res,next);
    result.directExpenseBalance = getting.total_balance;
    
    getting =  await getStockValue(req,res,next);
    result.currentInventoryBalance = getting;
    
    getting =  await  getServiceBalance(req,res,next);
    result.serviceBalance = getting.total_balance;
    
    getting =  await  getServiceExpenseBalance(req,res,next);
    result.serviceExpenseBalance = getting.total_balance;



    
    
    getting =  await   getSoldProfitBalance(req,res,next);
    result.itemSoldAmount = getting.sold_amount;
    result.itemCostingAmount = getting.costing_amount;

    result.item_profit_reversal = getting.item_profit_reversal ;


    result.itemProfitLoss = (getting.item_profit_balance - result.item_profit_reversal ) - result.directExpenseBalance;
    
    result.itemProfitLoss = result.itemProfitLoss + parseFloat(result.directIncomeBalance)
    
    
    debitAmount  = parseFloat(result.salesReturnBalance) + parseFloat(result.serviceExpenseBalance) + parseFloat(result.purchaseBalance) + parseFloat(result.directExpenseBalance)
                   + parseFloat(result.productTransferReceivedBalance)
    creditAmount = parseFloat(result.salesBalance) + parseFloat(result.serviceBalance) + parseFloat(result.purchaseReturnBalance) + parseFloat(result.directIncomeBalance) + parseFloat(result.currentInventoryBalance)
                   + parseFloat(result.productTransferBalance)
    
    
     grossProfitAmount = result.itemProfitLoss
    //  grossProfitAmount = debitAmount - creditAmount
    
    
    debitAmount = parseFloat(debitAmount) + parseFloat(grossProfitAmount)
    
    result.debitAmount  =  debitAmount
    result.creditAmount =  creditAmount
    result.grossProfitAmount =  grossProfitAmount
    // 
    
    getting =  await getIndirectIncomeBalance(req,res,next);
    result.indirectIncomeBalance = getting.total_balance;
    
    getting =  await getIndirectExpenseBalance(req,res,next);
    result.indirectExpenseBalance = getting.total_balance;
    
    creditTotal = parseFloat(grossProfitAmount)  + parseFloat(result.indirectIncomeBalance)
    
    netProfit = creditTotal - result.indirectExpenseBalance
    
    debitTotal = parseFloat(netProfit)  + parseFloat(result.indirectExpenseBalance)
    
    result.netProfit =  netProfit
    
    result.debitTotal =  debitTotal
    result.creditTotal =  creditTotal
    
    let finalResult = {}
    if(req.body.type == 'head_total'){
        finalResult.profitBalance = result.netProfit
    }else{
        finalResult = result
    }
    return finalResult
    
}




let getItemProfitBalance = async (req,res,next)=>{
    let payLoad = req.body;

  

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  `  between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [itemsErr,items] = await _p(db.query(`
        

    select 
    (
        select ifnull(sum(sd.sale_qty * sd.sale_rate),0) as sold_amount from tbl_sales_details sd 
        where sd.item_id = item.item_id 
        and sd.status = 'a' 
        and sd.branch_id = ${req.user.user_branch_id}
        and sd.created_date ${dateCluases}
    ) as sold_amount,
    (
        select ifnull(sum(sd.sale_qty * sd.purchase_average_rate),0) as costing_amount from tbl_sales_details sd 
        where sd.item_id = item.item_id 
        and sd.status = 'a' 
        and sd.branch_id = ${req.user.user_branch_id}
        and sd.created_date ${dateCluases}
    ) as costing_amount,


    (
        select ifnull(sum(srd.sale_r_qty * srd.sale_r_rate),0) as sold_return_amount from tbl_sales_return_details srd 
        where srd.item_id = item.item_id 
        and srd.status = 'a' 
        and srd.branch_id = ${req.user.user_branch_id}
        and srd.created_date ${dateCluases}
    ) as sold_return_amount,


    (
        select ifnull(sum(srd.sale_r_qty * avg_rate.average_rate),0) as costing_return_amount from tbl_sales_return_details srd 
        where srd.item_id = item.item_id 
        and srd.status = 'a' 
        and srd.branch_id = ${req.user.user_branch_id}
        and srd.created_date ${dateCluases}
    ) as costing_return_amount,


    (
        select sold_return_amount - costing_return_amount
    ) as item_profit_reversal,

    (
        select sold_amount - costing_amount
    ) as item_profit
    from  tbl_items item
    left join tbl_item_average_rate avg_rate on 
    avg_rate.item_id = item.item_id 
    and avg_rate.branch_id = ${req.user.user_branch_id} 


    where  item.status = 'a'  

    group by avg_rate.item_id



    `).then(res=>res));

    if(itemsErr && !items){
       return next(itemsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {items      : items}
    }


    let resFormat = {
        sold_amount : items.reduce((prev,curr)=>prev+parseFloat(curr.sold_amount),0),
        costing_amount :items.reduce((prev,curr)=>prev+parseFloat(curr.costing_amount),0),
        item_profit_balance : items.reduce((prev,curr)=>prev+parseFloat(curr.item_profit),0),
        item_profit_reversal : items.reduce((prev,curr)=>prev+parseFloat(curr.item_profit_reversal),0),
        ...rescluases
    }
    return resFormat
}



let getSoldProfitBalance = async (req,res,next)=>{
    let payLoad = req.body;

  

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  `  between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [itemsErr,items] = await _p(db.query(`



    SELECT 
    sold_amount,
    costing_amount,
    sold_return_amount,
    costing_return_amount,
    (sold_return_amount - costing_return_amount) AS item_profit_reversal,
    (sold_amount - costing_amount) AS item_profit

FROM (
    SELECT  
        IFNULL(SUM(sd.sale_qty * sd.sale_rate), 0) AS sold_amount,
        IFNULL(SUM(sd.sale_qty * sd.purchase_average_rate), 0) AS costing_amount,

        (
            SELECT IFNULL(SUM(srd.sale_r_qty * srd.sale_r_rate), 0) 
            FROM tbl_sales_return_details srd 
            WHERE srd.status = 'a'
            and srd.branch_id = ${req.user.user_branch_id}
            and srd.created_date ${dateCluases}
        ) AS sold_return_amount,

        (
            SELECT IFNULL(SUM(srd.sale_r_qty * avg_rate.average_rate), 0) 
            FROM tbl_sales_return_details srd 
            LEFT JOIN tbl_item_average_rate avg_rate ON avg_rate.item_id = srd.item_id 
            WHERE srd.status = 'a'
            and srd.branch_id = ${req.user.user_branch_id}
            and srd.created_date ${dateCluases}
        ) AS costing_return_amount

        FROM tbl_sales_details sd
        WHERE sd.status = 'a' 
        and sd.branch_id = ${req.user.user_branch_id}
        and sd.created_date ${dateCluases}

        ) AS subquery_alias

    `).then(res=>res));

    if(itemsErr && !items){
       return next(itemsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {items      : items}
    }


    let resFormat = {
        sold_amount : items.reduce((prev,curr)=>prev+parseFloat(curr.sold_amount),0),
        costing_amount :items.reduce((prev,curr)=>prev+parseFloat(curr.costing_amount),0),
        item_profit_balance : items.reduce((prev,curr)=>prev+parseFloat(curr.item_profit),0),
        item_profit_reversal : items.reduce((prev,curr)=>prev+parseFloat(curr.item_profit_reversal),0),
        ...rescluases
    }
    return resFormat
}




let getTransferReceiveBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

   
     

        let dateCluases = ''
        if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
            dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
        }


    let [datasErr,datas] = await _p(db.query(`
    select ifnull(sum(tm.total_amount),0) as receivedBalance
    from tbl_transfer_master tm
    where  tm.status = 'a'
    and tm.to_branch_id = ${req.user.user_branch_id}
    ${dateCluases != '' ? ` and tm.created_date ${dateCluases}` : ''}


    `).then(res=>res));

    if(datasErr && !datas){
       return next(datasErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {datas      : datas}
    }

    let resFormat = {
        total_balance : datas.reduce((prev,curr)=>prev+parseFloat(curr.receivedBalance),0),
        ...rescluases
    }
    return resFormat
    
 }



 let getTransferBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

   
     

        let dateCluases = ''
        if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
            dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
        }


    let [datasErr,datas] = await _p(db.query(`
    select ifnull(sum(tm.total_amount),0) as transferAmount
    from tbl_transfer_master tm
    where  tm.status = 'a'
    and tm.branch_id = ${req.user.user_branch_id}
    ${dateCluases != '' ? ` and tm.created_date ${dateCluases}` : ''}


    `).then(res=>res));

    if(datasErr && !datas){
       return next(datasErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {datas      : datas}
    }

    let resFormat = {
        total_balance : datas.reduce((prev,curr)=>prev+parseFloat(curr.transferAmount),0),
        ...rescluases
    }
    return resFormat
    
 }



router.post(`/api/get-profit-loss-balance`,async(req,res,next)=>{
 let result = await  getProfitLoss(req,res,next)
 res.json(result);
});

let getLoanBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  `  between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }

    let [loansErr,loans] = await _p(db.query(`
         select acc.acc_name,(
        select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
            where aacc.status = 'a' and aacc.acc_id = acc.acc_id
        ) as curr_opening_balance,
         (
           select ifnull(sum(jd.debit_amount),0) as debit_amount
               from tbl_journal_details jd
               left join tbl_journals  j on j.jrn_id = jd.jrn_id
               where jd.status = 'a' and jd.acc_id = acc.acc_id
                     and jd.debit_amount != 0
                     and j.status = 'a'
                     ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
         ) as debit_amount,

         (
            select ifnull(sum(jd.credit_amount),0) as credit_amount
                from tbl_journal_details jd
                left join tbl_journals  j on j.jrn_id = jd.jrn_id
                where jd.status = 'a' and jd.acc_id = acc.acc_id
                      and jd.credit_amount != 0
                      and j.status = 'a'
                      ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
          ) as credit_amount,

          (
            select ifnull(sum(ct.tran_amount),0) as pay_amount
                from tbl_contra_trans ct
                where ct.status = 'a' and ct.to_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
          ) as pay_amount,

          (
            select ifnull(sum(ct.tran_amount),0) as received_amount
                from tbl_contra_trans ct
                where ct.status = 'a' and ct.from_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
          ) as received_amount,

          (
            select debit_amount + pay_amount
          ) as payment_total,

          (
            select   credit_amount + received_amount
          ) as received_total,

          (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
          

          (
              select   (ifnull(curr_opening_balance,0) + received_total) - payment_total
          ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'loan'
         ${cluases}

    `).then(res=>res));

    if(loansErr && !loans){
       return next(loansErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {loans      : loans}
    }

    let resFormat = {
        total_balance : loans.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}
router.post(`/api/get-loan-balance`,async(req,res,next)=>{
    
    let result = await getLoanBalance(req,res,next)
    res.json(result);
});


router.post(`/api/get-loan-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;
    
  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        jm.creation_date as creation_date,
        concat("Loan Payment") as particular,
        jm.jrn_code as vch_no,
        'Journal' as vch_type,
        0.00 as debit_amount,
        ifnull(jd.debit_amount,0.00)  as credit_amount

        from tbl_journal_details jd
        left join tbl_journals jm on jm.jrn_id = jd.jrn_id
        left join tbl_accounts acc on acc.acc_id = jd.acc_id
        where jd.status = 'a' and jd.credit_amount = 0
        and jd.acc_id = ${payLoad.accId}
      
          
        union select 
        '2' as sequence,
        jm.creation_date as creation_date,
        concat('Loan Received') as particular,
        jm.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jd.credit_amount,0.00) as debit_amount,
        0  as credit_amount

        from tbl_journal_details jd
        left join tbl_journals jm on jm.jrn_id = jd.jrn_id
        left join tbl_accounts acc on acc.acc_id = jd.acc_id
        where jd.status = 'a' and jd.debit_amount = 0
        and jd.acc_id = ${payLoad.accId} 
        
        union select 
        '3' as sequence,
        ct.creation_date as creation_date,
        concat(acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        ifnull(ct.tran_amount,0.00) as debit_amount,
        0  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.to_acc_id
        where ct.status = 'a' and ct.branch_id = ${req.user.user_branch_id} 
        and ct.from_acc_id = ${payLoad.accId} 

        union select 
        '4' as sequence,
        ct.creation_date as creation_date,
        concat(acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        0 as debit_amount,
        ifnull(ct.tran_amount,0.00)  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.from_acc_id
        where ct.status = 'a' and ct.branch_id = ${req.user.user_branch_id}
        and ct.to_acc_id = ${payLoad.accId} 



        order by creation_date,sequence asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : expenses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });





router.post(`/api/get-fixed-asset-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;

  
    
  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        jm.creation_date as creation_date,
        concat("Fixed Asset  ") as particular,
        jm.jrn_code as vch_no,
        'Journal' as vch_type,
        ifnull(jd.debit_amount,0.00) as debit_amount,
        0.00  as credit_amount

        from tbl_journal_details jd
        left join tbl_journals jm on jm.jrn_id = jd.jrn_id
        left join tbl_accounts acc on acc.acc_id = jd.acc_id
        where jd.status = 'a' and jd.credit_amount = 0
        and jd.acc_id = ${payLoad.accId}
      
          
        union select 
        '2' as sequence,
        jm.creation_date as creation_date,
        concat('Fixed Asset  - Depreciation ') as particular,
        jm.jrn_code as vch_no,
        'Journal' as vch_type,
        0 as debit_amount,
        ifnull(jd.credit_amount,0.00) as credit_amount

        from tbl_journal_details jd
        left join tbl_journals jm on jm.jrn_id = jd.jrn_id
        left join tbl_accounts acc on acc.acc_id = jd.acc_id
        where jd.status = 'a' and jd.debit_amount = 0
        and jd.acc_id = ${payLoad.accId} 
        
        union select 
        '3' as sequence,
        ct.creation_date as creation_date,
        concat(acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        0 as debit_amount,
        ifnull(ct.tran_amount,0.00)  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.to_acc_id
        where ct.status = 'a' and ct.branch_id = ${req.user.user_branch_id} 
        and ct.from_acc_id = ${payLoad.accId} 

        union select 
        '4' as sequence,
        ct.creation_date as creation_date,
        concat(acc.acc_name) as particular,
        ct.contra_code as vch_no,
        'Contra' as vch_type,
        ifnull(ct.tran_amount,0.00) as debit_amount,
        0  as credit_amount

        from tbl_contra_trans ct
        left join tbl_accounts acc on acc.acc_id = ct.from_acc_id
        where ct.status = 'a' and ct.branch_id = ${req.user.user_branch_id}
        and ct.to_acc_id = ${payLoad.accId} 



        order by creation_date,sequence asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}

      
      // Get Opening Balance
      let [accountErr,account]  = await _p(db.selectSingleRow(`select ifnull(acc.opening_balance,0.00) as 
      opening_balance from tbl_accounts acc where acc.acc_id=${payLoad.accId}`).then(cus=>{
         return cus;
     }));
 
     let opening_balance  = account.opening_balance
     let closing_balance  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastBalance  = index == 0 ? opening_balance : expenses[index - 1].balance;
         value.balance = ( parseFloat(lastBalance) + parseFloat(value.debit_amount) ) - parseFloat(value.credit_amount)   ;
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_balance =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].balance : opening_balance;
          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
 
 
         if(newLedger.length > 0){
             closing_balance = newLedger.length > 0 ? newLedger[newLedger.length - 1].balance : 0;
         }
 
 
         res.json({opening_balance,
            closing_balance : newLedger.length == 0 ? opening_balance : closing_balance,
            ledger:newLedger,
            })
 });



 let getFixedAssetBalance = async (req,res,next)=>{
    let payLoad = req.body;
    let cluases = ``;

    if(payLoad.accId != undefined && payLoad.accId != null){
       cluases += ` and acc.acc_id = ${payLoad.accId} `
    }

    let dateCluases = '' 
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


    let [assetsErr,assets] = await _p(db.query(`
         select acc.acc_name, (
            select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
                   where aacc.status = 'a' and aacc.acc_id = acc.acc_id
               ) as curr_opening_balance,
         (
           select ifnull(sum(jd.debit_amount),0) as debit_amount
               from tbl_journal_details jd
               left join tbl_journals jm on jm.jrn_id = jd.jrn_id
               where jd.status = 'a' and jd.acc_id = acc.acc_id
                     and jd.debit_amount != 0
                     and jm.status = 'a'
                     ${dateCluases != '' ? ` and jm.creation_date ${dateCluases}` : ''}
         ) as debit_amount,

         (
            select ifnull(sum(jd.credit_amount),0) as credit_amount
                from tbl_journal_details jd
                left join tbl_journals jm on jm.jrn_id = jd.jrn_id
                where jd.status = 'a' and jd.acc_id = acc.acc_id
                      and jd.credit_amount != 0
                      and jm.status = 'a'
                     ${dateCluases != '' ? ` and jm.creation_date ${dateCluases}` : ''}
          ) as credit_amount,

          (
            select ifnull(sum(ct.tran_amount),0) as pay_amount
                from tbl_contra_trans ct
                where ct.status = 'a' and ct.to_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
          ) as pay_amount,

          (
            select ifnull(sum(ct.tran_amount),0) as received_amount
                from tbl_contra_trans ct
                where ct.status = 'a' and ct.from_acc_id = acc.acc_id
                ${dateCluases != '' ? ` and ct.creation_date ${dateCluases}` : ''}
          ) as received_amount,

          (
            select debit_amount + pay_amount
          ) as payment_total,

          (
            select credit_amount + received_amount
          ) as received_total,

          (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,
          

          (
              select    (payment_total - received_total) + ifnull(curr_opening_balance,0)
          ) as balance
        
         from tbl_accounts acc 
         where acc.status = 'a' and acc.branch_id = ${req.user.user_branch_id}
               and acc.acc_type_id = 'fixed_asset'
         ${cluases}

    `).then(res=>res));

    if(assetsErr && !assets){
       return next(assetsErr)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {assets      : assets}
    }

    let resFormat = {
        total_balance : assets.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }

    return resFormat;
 }


 router.post(`/api/get-fixed-asset-balance`,async(req,res,next)=>{
    let result =  await getFixedAssetBalance(req,res,next)
    res.json(result);
});





router.post(`/api/get-trial-balance`,async(req,res,next)=>{
            let result = {}

            let debitAmount  =  0;
            let creditAmount  =  0;

            let grossProfitAmount  =  0;

            let debitTotal  =  0;
            let creditTotal  =  0;

            let netProfit = 0;
            let getting;

            getting =  await getSalesBalance(req,res,next);
            result.salesBalance = getting.total_balance;

            getting =  await getSalesReturnBalance(req,res,next);
            result.salesReturnBalance = getting.total_balance;

            getting =  await getPurchaseBalance(req,res,next);
            result.purchaseBalance = getting.total_balance;

            getting =  await getPurchaseReturnBalance(req,res,next);
            result.purchaseReturnBalance = getting.total_balance;

            getting =  await getDirectIncomeBalance(req,res,next);
            result.directIncomeBalance = getting.total_balance;

            getting =  await getDirectExpenseBalance(req,res,next);
            result.directExpenseBalance = getting.total_balance;

            getting =  await getIndirectIncomeBalance(req,res,next);
            result.indirectIncomeBalance = getting.total_balance;

            getting =  await getIndirectExpenseBalance(req,res,next);
            result.indirectExpenseBalance = getting.total_balance; 

            getting =  await  getServiceBalance(req,res,next);
            result.serviceBalance = getting.total_balance;
        
            getting =  await  getServiceExpenseBalance(req,res,next);
            result.serviceExpenseBalance = getting.total_balance;

            // ////////


            getting =  await  getAdvanceCreditorBalance(req,res,next);
            result.advanceCreditorBalance = getting.total_balance;
        
           
            getting =  await  getAdvanceDebtorBalance(req,res,next);
            result.advanceDebtorBalance = getting.total_balance;



        
            getting =  await  getCreditorBalance(req,res,next);
            result.creditorBalance = getting.total_balance;
        
            getting =  await  getDebtorBalance(req,res,next);
            result.debtorBalance = getting.total_balance;
        
            
        
            getting =  await  getCapitalBalance(req,res,next);
            result.capitalBalance = getting.total_balance;
        
           
        
            getting =  await  getOpeningBalance(req,res,next);
            result.diffOpeningBalance = getting.total_balance;
        
            getting =  await  getLoanBalance(req,res,next);
            result.loanBalance = getting.total_balance;
        
            let cashAcc = req
                cashAcc.body.accType = "'cash_in_hand'"
        
            getting =  await  getAccountBalance(cashAcc,res,next);
            result.cashBalance = getting.total_balance;
        
            let bankAcc = req
            bankAcc.body.accType = "'bank_account'"
            getting =  await  getAccountBalance(bankAcc,res,next);
            result.bankBalance = getting.total_balance;
        
            getting =  await  getFixedAssetBalance(req,res,next);
            result.fixedAssestsBalance = getting.total_balance;
        
            getting =  await  getTaxBalance(req,res,next);
            result.taxBalance = getting.total_balance;
            getting =  await  getBranchBalance(req,res,next);
            result.receiveableBranchAmount = getting.total_balance;
        



            res.json(result)


});

 
router.post(`/api/get-balance-sheet`,async(req,res,next)=>{
    let result = {}
   
    let getting;


    getting =  await getSalesBalance(req,res,next);
    result.salesBalance = getting.total_balance;


    getting =  await  getCreditorBalance(req,res,next);
    result.creditorBalance = getting.total_balance;

    getting =  await  getAdvanceCreditorBalance(req,res,next);
    result.advanceCreditorBalance = getting.total_balance;

    getting =  await  getDebtorBalance(req,res,next);
    result.debtorBalance = getting.total_balance;

    getting =  await  getAdvanceDebtorBalance(req,res,next);
    result.advanceDebtorBalance = getting.total_balance;



    getting =  await   getTransferBalance(req,res,next);
    result.productTransferBalance = getting.total_balance;


    getting =  await   getTransferReceiveBalance(req,res,next);
    result.productTransferReceivedBalance = getting.total_balance;


    

    getting =  await  getCapitalBalance(req,res,next);
    result.capitalBalance = getting.total_balance;

    getting =  await  getTaxBalance(req,res,next);
    result.taxBalance = getting.total_balance;


    getting =  await  getOpeningBalance(req,res,next);
    result.diffOpeningBalance = getting.total_balance;

    getting =  await  getLoanBalance(req,res,next);
    result.loanBalance = getting.total_balance;

    let cashAcc = req
        cashAcc.body.accType = "'cash_in_hand'"

    getting =  await  getAccountBalance(cashAcc,res,next);
    result.cashBalance = getting.total_balance;

    let bankAcc = req
    bankAcc.body.accType = "'bank_account'"
    getting =  await  getAccountBalance(bankAcc,res,next);
    result.bankBalance = getting.total_balance;

    getting =  await  getFixedAssetBalance(req,res,next);
    result.fixedAssestsBalance = getting.total_balance;

    getting =  await  getStockValue(req,res,next);
    result.inventoryBalance = getting;

    getting =  await  getProfitLoss(req,res,next);
    result.profitLossBalance = getting.profitBalance;

    getting =  await  getBranchBalance(req,res,next);
    result.receiveableBranchAmount = getting.total_balance;


    res.json(result)



});




router.post(`/api/get-customer-collection-balance`,async(req,res,next)=>{
   
    let result = await getCustomerCollectionBalance(req,res,next) 
    res.json(result)
});


let getCustomerCollectionBalance = async(req,res,next)=>{
    let payLoad = req.body;
   let cluases = ` `
   if(payLoad.customerId != undefined && payLoad.customerId != null){
       cluases +=  ` and acc.acc_id = ${payLoad.customerId} `
   }


   if(payLoad.componentName != undefined && payLoad.componentName != null){
    cluases +=  ` and gp.component_name = '${payLoad.componentName}' `
   }

   if(payLoad.groupId != undefined && payLoad.groupId != null){
    cluases +=  ` and gp.group_id = ${payLoad.groupId} `
   }

   let dateCluases = ''
    if(payLoad.fromDate != undefined && payLoad.toDate != undefined){
        dateCluases +=  ` between "${payLoad.fromDate}" and "${payLoad.toDate}" `
    }


   if(payLoad.locationId != undefined && payLoad.locationId != null){
    cluases +=  ` and acc.location_id = ${payLoad.locationId} `
   }
   let [errDebitorBalances,debitorBalances] =  await _p(db.query(`select acc.acc_id,acc.acc_code,acc.group_id,acc.acc_name,acc.contact_no,acc.address,




       (
    select ifnull(aacc.opening_balance,0) as curr_opening_balance  from tbl_accounts aacc 
           where aacc.status = 'a' and aacc.acc_id = acc.acc_id
       ) as curr_opening_balance,


       ifnull( (
        select ifnull(sum(coll.amount),0) as collAmount from tbl_debtor_collections coll
               where coll.acc_id = acc.acc_id 
               and coll.branch_id = ${req.user.user_branch_id}
       ),0) as collected_amount,


        ( 
            select ifnull(sum(sm.total_amount),0) as sale_bill_amount
             from tbl_sales_master sm 
             where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id}
                   and sm.acc_id = acc.acc_id
        ) as sale_bill_amount,

        ( 
            select ifnull(sum(sm.paid_amount),0) as sale_received_amount
             from tbl_sales_master sm 
             where sm.status = 'a' and sm.branch_id = ${req.user.user_branch_id}
                   and sm.acc_id = acc.acc_id
        ) as sale_received_amount,


        ( 
            select ifnull(sum(svm.total_amount),0) as service_bill_amount
             from tbl_service_master svm 
             where svm.status = 'a' and svm.branch_id = ${req.user.user_branch_id}
                   and svm.acc_id = acc.acc_id
        ) as service_bill_amount,

        ( 
            select ifnull(sum(svm.paid_amount),0) as service_received_amount
             from tbl_service_master svm 
             where svm.status = 'a' and svm.branch_id = ${req.user.user_branch_id}
                   and svm.acc_id = acc.acc_id
        ) as service_received_amount,



        ( 
            select ifnull(sum(srm.total_amount),0) as return_amount
             from tbl_sales_return_master srm 
             where srm.status = 'a' and srm.branch_id = ${req.user.user_branch_id}
                   and srm.acc_id = acc.acc_id
                   ${dateCluases != '' ? ` and srm.created_date ${dateCluases}` : ''}
        ) as return_amount,

        
        ( 
            select ifnull(sum(receipt.rcv_total),0) as rcv_total
             from tbl_debitor_receipt_details receipt
             left join tbl_debitor_receipts  dr on dr.rcv_id = receipt.rcv_id
             where receipt.status = 'a' 
                   and receipt.from_acc_id = acc.acc_id
                   and dr.status = 'a'
                   ${dateCluases != '' ? ` and dr.creation_date ${dateCluases}` : ''}
        ) as rcv_total,


        ( 
            select ifnull(sum(receipt.discount_amount),0) as discount_amount
             from tbl_debitor_receipt_details receipt
             left join tbl_debitor_receipts  dr on dr.rcv_id = receipt.rcv_id
             where receipt.status = 'a' 
                   and receipt.from_acc_id = acc.acc_id
                   and dr.status = 'a'
                   ${dateCluases != '' ? ` and dr.creation_date ${dateCluases}` : ''}
        ) as discount_amount,


        ( 
            select ifnull(sum(jd.debit_amount),0) as jrn_debit_total
             from tbl_journal_details jd
             left join tbl_journals  j on j.jrn_id = jd.jrn_id
             where jd.status = 'a' 
                   and jd.acc_id = acc.acc_id
                   and j.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
        ) as jrn_debit_total,

        ( 
            select ifnull(sum(jd.credit_amount),0) as jrn_credit_total
             from tbl_journal_details jd
             left join tbl_journals  j on j.jrn_id = jd.jrn_id
             where jd.status = 'a' 
                   and jd.acc_id = acc.acc_id
                   and j.status = 'a'
                   ${dateCluases != '' ? ` and j.creation_date ${dateCluases}` : ''}
        ) as jrn_credit_total,



        (
          select    sale_bill_amount + service_bill_amount 
        ) as total_bill_amount,
         
        (
            select jrn_credit_total + sale_received_amount + service_received_amount + rcv_total  + collected_amount
        ) as total_received_amount,

        (
            select jrn_debit_total
        ) as total_payment,

        (
            select ifnull(curr_opening_balance,0) as opening_balance
           ) as opening_balance,

           (
              select  ifnull(emi_month,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id order by sale_id  desc limit 1
           ) as emi_month,
          

           (
            select  ifnull(day_week,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id  order by sale_id  desc limit 1
         ) as day_week,

         (
            select  ifnull(emi_amount,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id  order by sale_id  desc limit 1
         ) as emi_amount,

         (
            select  ifnull(total_amount,0) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id  order by sale_id  desc limit 1
         ) as sale_amount,

         (
            select  count(*) from tbl_sales_master where status = 'a' and acc_id = acc.acc_id  order by sale_id  desc limit 1
         ) as sale_count,

         (
            select  created_date from tbl_sales_master where status = 'a' and acc_id = acc.acc_id  order by sale_id  desc limit 1
         ) as sale_date,

         (
            select  ifnull(count(*),0) from tbl_debtor_collections where  acc_id = acc.acc_id 
         ) as paid_day_week_month,

  
         (
            select (emi_amount * paid_day_week_month) - (collected_amount)
         ) as over_due,






         ( 
            select ifnull(sum(at.tran_amount),0) as ad_rcv_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'receive'
                   and at.acc_type = 'debitor'
        ) as ad_rcv_amount,

        ( 
            select ifnull(sum(at.tran_amount),0) as ad_pay_amount
             from tbl_advance_transactions  at 
             where at.tran_status = 'a' 
             and at.branch_id = ${req.user.user_branch_id}
                   and at.acc_id = acc.acc_id
                   and at.tran_type = 'payment'
                   and at.acc_type = 'debitor'
        ) as ad_pay_amount,



        (
            select ad_rcv_amount - ad_pay_amount 
        ) as ad_balance,







        (
            select   ( ifnull(curr_opening_balance,0) + total_bill_amount  + total_payment ) - (total_received_amount + return_amount + discount_amount)   
        ) as balance


        from tbl_accounts acc
        left join tbl_collection_groups gp on gp.group_id = acc.group_id
        where acc.status = 'a' 
        and acc.party_type <> 'general'
        and acc.branch_id = ${req.user.user_branch_id}
        and acc.acc_type_id = 'debitor'
        ${cluases}

        order by acc.acc_name   asc `)).then(result=>{
        return result;
    });

    if(errDebitorBalances && !debitorBalances){
        next(errDebitorBalances)
    }

    let rescluases = {}

    if(payLoad.type != 'head_total'){
        rescluases = {accounts      : debitorBalances}
    }

    let resFormat = {
        total_balance : debitorBalances.reduce((prev,curr)=>prev+parseFloat(curr.balance),0),
        ...rescluases
    }
    return resFormat
}


router.post('/api/get-customer-count',async(req,res,next)=>{  

    let [,count] =  await _p(db.countRows(`select acc_id  from tbl_accounts where status = 'a' and acc_type_id = 'debitor'  `)).then(result=>{
       return result;
   });

   let [,last] =  await _p(db.select(`select acc_id  from tbl_accounts 
       where status = 'a' and acc_type_id = 'debitor' 
       order by acc_id desc limit 1
   `)).then(result=>{
       return result;
   });


   res.json({
       count:count,
       last: last.length != 0 ? last[0].acc_id : 0
   })

});


module.exports = router;