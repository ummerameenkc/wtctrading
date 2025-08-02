const router = require('express').Router();
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const multer = require("multer")
const  {getCurrentISODT,isoFromDate,isoToDate} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const  {Transaction}   = require('../utils/TranDB');
const config =   require('../config.json');
// const axios = require('axios')
const FormData = require('form-data');
const {generate}      = require('../utils/passwords');
const tokenSession      = require('../utils/token_session');
const  {getStock,itemCostUpdate,stockUpdate}   = require('../models/stock');
// For Backup
const  dbConfig   = require('../utils/dbConfig');
const mysqldump = require('mysqldump');
// End 

let    db = new Database();
let    Tran = new Transaction();

const storage = multer.diskStorage({
    destination: './uploads',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + 
    path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter : (req,file,cb)=>{
        if((file.mimetype != "image/jpeg" ) && (file.mimetype != "image/png") && (file.mimetype != "image/jpg")){
            // cb(null,true)
            return cb({
                error: true,
                message: `Only .png, .jpeg, .jpg format allowed.`
            })
        }else{
            cb(null,true)
        }
    },
    limits: { fileSize :  102400}
})


const uploadSingleImage = upload.single("pro_logo")

const uploadSingleItem = upload.single("photo")


let getAccCode = async (req,res,next)=>{
    let [customerCodeError,customerCode] =  await _p(db.countRows(`select acc_id   from tbl_accounts where  branch_id = ${req.user.user_branch_id} and (acc_type_id != 'debitor' and acc_type_id != 'creditor') 
      `)).then(result=>{
        return result;
    });
    if(customerCodeError){
        next(customerCodeError)
    }
    if(customerCode == 0){
        customerCode = 'C';
    }else{
        customerCode = 'C'+((parseFloat(customerCode)+1) - 15);
    }
    return new Promise((resolve,reject)=>{
             resolve(customerCode)
    })
}

let getCustomerCode = async (req,res,next)=>{
    let [customerCodeError,customerCode] =  await _p(db.countRows(`select acc_id   from tbl_accounts where  branch_id = ${req.user.user_branch_id} and acc_type_id = 'debitor' 
      `)).then(result=>{
        return result;
    });
    if(customerCodeError){
        next(customerCodeError)
    }
    if(customerCode==0){
        customerCode = 'CUS-1';
    }else{
        customerCode = 'CUS-'+(parseFloat(customerCode)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(customerCode)
    })
}

router.post(`/api/get-acc-code`,async(req,res,next)=>{
    let cluases = ``

    res.json(await getAccCode(req,res,next));

})

router.post(`/api/get-customer-code`,async(req,res,next)=>{
    let cluases = ``

    res.json(await getCustomerCode(req,res,next));

})


router.post(`/api/get-journals`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  jrn.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

   
    

    if(req.body.accId != undefined && req.body.accId != null){
        cluases += ` and  acc.acc_id = ${req.body.accId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  jrn.create_by = ${req.body.userId} `
    }

   



    let [journalsErr,journals] =  await _p(db.query(`select jrn.*,u.user_name,u.user_full_name
     from tbl_journals jrn
     left join tbl_users u on u.user_id = jrn.create_by
     where jrn.branch_id = ? 
     and jrn.status = 'a' 
     ${cluases}
     order by jrn_id desc

     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


   

    res.json(journals);

})

router.post(`/api/get-journal-record-details`,async(req,res,next)=>{
    let cluases = ``

  
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  jrn.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }
    if(req.body.accId != undefined && req.body.accId != null){
        cluases += ` and  jrnd.acc_id = ${req.body.accId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  jrn.create_by = ${req.body.userId} `
    }

          let [detailsErr,details] =  await _p(db.query(`select jrnd.*,acc.acc_name,acc.acc_id,jrn.jrn_code,jrn.creation_date,u.user_full_name
                from tbl_journal_details jrnd
                left join tbl_journals jrn on jrn.jrn_id  = jrnd.jrn_id 
                left join tbl_accounts acc on acc.acc_id = jrnd.acc_id
                left join tbl_users u on u.user_id = jrn.create_by
                where  jrnd.status = 'a' 
                and jrn.branch_id = ?
                ${cluases}
                `,[req.user.user_branch_id]).then(res=>{
                    return res;
                }));

          
    res.json(details);

})


router.post(`/api/get-journal-with-details`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(jrn.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  jrn.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

   
    


    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  jrn.create_by = ${req.body.userId} `
    }


    let [journalsErr,journals] =  await _p(db.query(`select jrn.*,u.user_name,u.user_full_name
     from tbl_journals jrn
     left join tbl_users u on u.user_id = jrn.create_by
     where jrn.branch_id = ? 
     and jrn.status = 'a' 
     ${cluases}
     order by jrn_id desc

     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    journals = journals.map(async (journal)=>{
          let [detailsErr,details] =  await _p(db.query(`select jrnd.*,acc.acc_name,acc.acc_id
                from tbl_journal_details jrnd
                left join tbl_accounts acc on acc.acc_id = jrnd.acc_id
                where  jrnd.status = 'a' 
                and jrnd.jrn_id = ?
                `,[journal.jrn_id]).then(res=>{
                    return res;
                }));
            journal.details = details;
            return journal;
    })

    res.json( await  Promise.all(journals));

})

router.post(`/api/get-debitor-rcv-record`,async(req,res,next)=>{
    let cluases = ``
    
   

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  rcv.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.rcv_id != undefined && req.body.rcv_id != null){
        cluases += ` and  rcv.rcv_id = ${req.body.rcv_id} `
    }
    

    if(req.body.customerId != undefined && req.body.customerId != null){
        cluases += ` and  acc.acc_id = ${req.body.customerId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  rcv.creation_by = ${req.body.userId} `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id = ${req.body.locationId} `
    }

    let [,rcvs] =  await _p(db.query(`select rcv.*,u.user_name,u.user_full_name
    from tbl_debitor_receipts rcv
    left join tbl_users u on u.user_id = rcv.creation_by
     where rcv.branch_id = ? 
     and rcv.status = 'a' 
     
     ${cluases}
     order by rcv.rcv_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    rcvs = rcvs.map(async (rcv)=>{

        let [,details] =  await _p(db.query(`select rcvd.from_acc_id
              from  tbl_debitor_receipt_details rcvd
           
              where  rcvd.status = 'a' 
              and rcvd.rcv_id = ?
              `,[rcv.rcv_id]).then(res=>{
                  return res;
              }));

              if(details.length != 0 ){

                  let [,customer] =  await _p(db.query(`select acc.acc_name,acc.acc_code,acc.institution_name,acc.address,acc.contact_no,acc.acc_id
                  from  tbl_accounts acc 
                  where
                  acc.acc_id = ?
                  `,[details[0].from_acc_id]).then(res=>{
                      return res;
                  }));
                   rcv = { ...rcv, ...customer[0] };
              }

          return rcv;
  })


    res.json(await  Promise.all(rcvs));

})

router.post(`/api/get-debitor-rcv-with-details`,async(req,res,next)=>{
    let cluases = ``
    
    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(rcv.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  rcv.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.rcv_id != undefined && req.body.rcv_id != null){
        cluases += ` and  rcv.rcv_id = ${req.body.rcv_id} `
    }


    if(req.body.customerId != undefined && req.body.customerId != null){
        cluases += ` and  acc.acc_id = ${req.body.customerId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  rcv.creation_by = ${req.body.userId} `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id = ${req.body.locationId} `
    }



    let [,rcvs] =  await _p(db.query(`select rcv.*,u.user_name,u.user_full_name
     from  tbl_debitor_receipts rcv
     left join tbl_users u on u.user_id = rcv.creation_by
     where rcv.branch_id = ? 
     and rcv.status = 'a' 
     ${cluases}
     ORDER BY rcv.rcv_id DESC

     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    rcvs = rcvs.map(async (rcv)=>{

          let [,details] =  await _p(db.query(`select rcvd.*,acc.acc_name as into_acc_name,
          acca.acc_name as from_acc_name,
          accd.acc_name as direct_income_acc_name,accc.acc_name as current_liability_acc_name 
                from  tbl_debitor_receipt_details rcvd
                left join tbl_accounts acc on acc.acc_id = rcvd.into_acc_id
                left join tbl_accounts acca on acca.acc_id = rcvd.from_acc_id
                left join tbl_accounts accd on accd.acc_id = rcvd.direct_income_id
                left join tbl_accounts accc on accc.acc_id = rcvd.current_liability_id
                where  rcvd.status = 'a' 
                and rcvd.rcv_id = ?
                `,[rcv.rcv_id]).then(res=>{
                    return res;
                }));
                rcv.details = details;

                if(details.length != 0 ){

                    let [,customer] =  await _p(db.query(`select acc.acc_name,acc.acc_code,acc.institution_name,acc.address,acc.contact_no,acc.acc_id
                    from  tbl_accounts acc 
                    where
                    acc.acc_id = ?
                    `,[details[0].from_acc_id]).then(res=>{
                        return res;
                    }));
                     rcv = { ...rcv, ...customer[0] };
                }

            return rcv;
    })

    rcvs = await  Promise.all(rcvs)

    res.json(rcvs);

})


router.post(`/api/get-creditor-pay-record`,async(req,res,next)=>{
    let cluases = ``
    
   
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  pay.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.pay_id != undefined && req.body.pay_id != null){
        cluases += ` and  pay.pay_id = ${req.body.pay_id} `
    }
    

    if(req.body.supplierId != undefined && req.body.supplierId != null){
        cluases += ` and  acc.acc_id = ${req.body.supplierId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  pay.creation_by = ${req.body.userId} `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id = ${req.body.locationId} `
    }


    let [,pays] =  await _p(db.query(`select pay.*,u.user_name,u.user_full_name,acc.acc_name,
    acc.acc_code,acc.institution_name,acc.address,acc.contact_no
     from  tbl_creditor_payments pay
     left join tbl_users u on u.user_id = pay.creation_by
     left join tbl_creditor_pay_details d on pay.pay_id  = d.pay_id
     left join tbl_accounts acc on   d.to_acc_id = acc.acc_id
     where pay.branch_id = ? 
     and pay.status = 'a' 
     
     ${cluases}
     order by pay.pay_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));



    pays = pays.map(async (pay)=>{
        let [,details] =  await _p(db.query(`select payd.to_acc_id
        from tbl_creditor_pay_details payd 
              where  payd.status = 'a' 
              and payd.pay_id = ?
              `,[pay.pay_id]).then(res=>{
                  return res;
              }));

              
              if(details.length != 0 ){

                  let [,supplier] =  await _p(db.query(`select acc.acc_name,acc.acc_code,acc.institution_name,acc.address,acc.contact_no,acc.acc_id
                  from  tbl_accounts acc 
                  where
                  acc.acc_id = ?
                  `,[details[0].to_acc_id]).then(res=>{
                      return res;
                  }));
                  pay = { ...pay, ...supplier[0] };
              }

          return pay;
  })

  res.json( await  Promise.all(pays));

})


router.post(`/api/get-creditor-pay-with-details`,async(req,res,next)=>{
    let cluases = ``
    
    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(pay.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }


    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  pay.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.pay_id != undefined && req.body.pay_id != null){
        cluases += ` and  pay.pay_id = ${req.body.pay_id} `
    }
    

    if(req.body.supplierId != undefined && req.body.supplierId != null){
        cluases += ` and  acc.acc_id = ${req.body.supplierId} `
    }

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  pay.creation_by = ${req.body.userId} `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id = ${req.body.locationId} `
    }


    let [,pays] =  await _p(db.query(`select pay.*,u.user_name,u.user_full_name,u.user_full_name
    
     from  tbl_creditor_payments pay
     left join tbl_users u on u.user_id = pay.creation_by
     where pay.branch_id = ? 
     and pay.status = 'a' 
     
     ${cluases}
     order by pay.pay_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    pays = pays.map(async (pay)=>{
          let [,details] =  await _p(db.query(`select payd.*,acc.acc_name as to_acc_name,
          acca.acc_name as from_acc_name,accd.acc_name as direct_income_acc_name,accc.acc_name as current_liability_acc_name 
                from  tbl_creditor_pay_details payd
                left join tbl_accounts acc on acc.acc_id = payd.to_acc_id
                left join tbl_accounts acca on acca.acc_id = payd.from_acc_id
                left join tbl_accounts accd on accd.acc_id = payd.direct_income_id
                left join tbl_accounts accc on accc.acc_id = payd.current_liability_id
                where  payd.status = 'a' 
                and payd.pay_id = ?
                `,[pay.pay_id]).then(res=>{
                    return res;
                }));
                pay.details = details;

                
                if(details.length != 0 ){

                    let [,supplier] =  await _p(db.query(`select acc.acc_name,acc.acc_code,acc.institution_name,acc.address,acc.contact_no,acc.acc_id
                    from  tbl_accounts acc 
                    where
                    acc.acc_id = ?
                    `,[details[0].to_acc_id]).then(res=>{
                        return res;
                    }));
                    pay = { ...pay, ...supplier[0] };
                }

            return pay;
    })

    res.json( await  Promise.all(pays));

})
  
router.post(`/api/get-expense-record-details`,async(req,res,next)=>{
    let cluases = ``
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  exp.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.expId != undefined && req.body.expId != null){
        cluases += ` and  expd.to_acc_id = ${req.body.expId} `
    }
    



    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  exp.creation_by = ${req.body.userId} `
    }



    let [detailsErr,details] =  await _p(db.query(`select expd.*,acc.acc_name,acc.acc_id,exp.exp_code,exp.creation_date,exp.narration,
    u.user_full_name
    from tbl_expense_details expd 
    left join tbl_expenses exp on exp.exp_id = expd.exp_id
    left join tbl_accounts acc on acc.acc_id = expd.to_acc_id
    left join tbl_users u on u.user_id = exp.creation_by

    where  expd.status = 'a' and expd.branch_id = ?
    ${cluases}
    `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    res.json(details)
})

router.post(`/api/get-income-record-details`,async(req,res,next)=>{
    let cluases = ``
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  inc.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.incId != undefined && req.body.incId != null){
        cluases += ` and  incd.from_acc_id = ${req.body.incId} `
    }
    



    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  inc.creation_by = ${req.body.userId} `
    }



    let [detailsErr,details] =  await _p(db.query(`select incd.*,acc.acc_name,acc.acc_id,inc.inc_code,inc.creation_date,
    u.user_full_name
    from tbl_income_details incd
    left join tbl_incomes inc on inc.inc_id = incd.inc_id
    left join tbl_accounts acc on acc.acc_id = incd.from_acc_id
    left join tbl_users u on u.user_id = inc.creation_by

    where  incd.status = 'a' 
   and incd.branch_id = ?
    `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    res.json(details)
})

router.post(`/api/approve-expense-recognition`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        await Tran.update(`tbl_expense_recognition`,{status:'a'},{recog_id:req.body.recog_id},transaction)
        await Tran.update(`tbl_expense_recognition_details`,{status:'a'},{recog_id:req.body.recog_id},transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Expense  Recognition Successfully Approved.`
        });
    }catch (err) {
        await transaction.rollback();
        next(err);
    }
});


router.post(`/api/get-recognition-with-details`,async(req,res,next)=>{
    let cluases = ``
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  re.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }


    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  re.creation_by = ${req.body.userId} `
    }



    let [masterErr,master] =  await _p(db.query(`select re.*,
    u.user_full_name
    from  tbl_expense_recognition re 
    left join tbl_users u on u.user_id = re.creation_by
 

    where  re.status != 'd' 
   and re.branch_id = ?

   ${cluases}
    `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));



    master = master.map(async (mas)=>{
        let [detailsErr,details] =  await _p(db.query(`select red.*
              from tbl_expense_recognition_details red
              where  red.status != 'd' 
              and red.recog_id  = ?
              `,[mas.recog_id ]).then(res=>{
                  return res;
              }));
              mas.details = details;

            
          return mas;
  })




    res.json(await  Promise.all(master))
})

router.post(`/api/get-expense-record`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  exp.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.exp_id != undefined && req.body.exp_id != null){
        cluases += ` and  exp.exp_id = ${req.body.exp_id} `
    }
    



    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  exp.creation_by = ${req.body.userId} `
    }

   
    if(req.body.employeeId != undefined && req.body.employeeId != null){
        cluases += ` and  exp.employee_id = ${req.body.employeeId} `
    }



    let [expensesErr,expenses] =  await _p(db.query(`select exp.*,u.user_name,u.user_full_name,acc.acc_name
     from tbl_expenses exp
     left join tbl_accounts acc on acc.acc_id = exp.from_acc_id
     left join tbl_users u on u.user_id = exp.creation_by
     where exp.branch_id = ? 
     and exp.status = 'a'  
     ${cluases}
     order by exp.exp_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    res.json(expenses);

})   



router.post(`/api/expense-recognition-record`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  exp.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

   



    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  exp.creation_by = ${req.body.userId} `
    }

   
 


    let [expensesErr,expenses] =  await _p(db.query(`select exp.*,u.user_name,u.user_full_name
     from tbl_expense_recognition exp
     left join tbl_users u on u.user_id = exp.creation_by
     where exp.branch_id = ? 
     and exp.status != 'd'  
     ${cluases}
     
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    res.json(expenses);

})  


router.post(`/api/get-expense-with-details`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(exp.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    if(req.body.employeeId != undefined && req.body.employeeId != null){
        cluases += ` and  exp.employee_id = ${req.body.employeeId} `
    }


    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  exp.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    
    


    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  exp.creation_by = ${req.body.userId} `
    }



    let [expensesErr,expenses] =  await _p(db.query(`select exp.*,u.user_name,u.user_full_name,acc.acc_name,emp.employee_name
     from tbl_expenses exp
     left join tbl_accounts acc on acc.acc_id = exp.from_acc_id
     left join tbl_employees  emp on emp.employee_id = exp.employee_id
     left join tbl_users u on u.user_id = exp.creation_by
     where exp.branch_id = ? 
     and exp.status = 'a'  
     ${cluases}
     order by exp.exp_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));



    expenses = expenses.map(async (expense)=>{
          let [detailsErr,details] =  await _p(db.query(`select expd.*,acc.acc_name,acc.acc_id
                from tbl_expense_details expd
                left join tbl_accounts acc on acc.acc_id = expd.to_acc_id
                where  expd.status = 'a' 
                and expd.exp_id  = ?
                `,[expense.exp_id ]).then(res=>{
                    return res;
                }));
                expense.details = details;
            return expense;
    })

    res.json( await  Promise.all(expenses));

})


router.post(`/api/get-income-record`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  inc.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.inc_id != undefined && req.body.inc_id != null){
        cluases += ` and  inc.inc_id = ${req.body.inc_id} `
    }
    



    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  inc.creation_by = ${req.body.userId} `
    }

   

    let [incomesErr,incomes] =  await _p(db.query(`select inc.*,u.user_name,u.user_full_name,acc.acc_name
     from tbl_incomes inc
     left join tbl_accounts acc on acc.acc_id = inc.into_acc_id
     left join tbl_users u on u.user_id = inc.creation_by
     where inc.branch_id = ? 
     and inc.status = 'a'  
     ${cluases}
     order by inc.inc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    res.json(incomes);

})

router.post(`/api/get-income-with-details`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(inc.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }


    let [incomesErr,incomes] =  await _p(db.query(`select inc.*,u.user_name,u.user_full_name,acc.acc_name
     from tbl_incomes inc
     left join tbl_accounts acc on acc.acc_id = inc.into_acc_id
     left join tbl_users u on u.user_id = inc.creation_by
     where inc.branch_id = ? 
     and inc.status = 'a'  
     ${cluases}
     order by inc.inc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));




    incomes = incomes.map(async (income)=>{
          let [detailsErr,details] =  await _p(db.query(`select incd.*,acc.acc_name,acc.acc_id
                from tbl_income_details incd
                left join tbl_accounts acc on acc.acc_id = incd.from_acc_id
                where  incd.status = 'a' 
                and incd.inc_id  = ?
                `,[income.inc_id ]).then(res=>{
                    return res;
                }));
                income.details = details;
            return income;
    })

    res.json( await  Promise.all(incomes));

})


router.post(`/api/save-journal`,async(req,res,next)=>{
   
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let jrn = req.body.jrn;
    let jrnDetail = req.body.jrnDetail
        jrn.create_by = req.user.user_id;
        jrn.branch_id = req.user.user_branch_id;

    if(jrn.action == 'create'){
        let exist = await Tran.countRows(`select jrn_code from tbl_journals where jrn_code=?  and status= 'a'`,[jrn.jrn_code], transaction)
      
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Journal Code Already Exists.`
            });
            return false
        }

        delete jrn.action;
        delete jrn.jrn_id;
        let [save, _]  = await Tran.create(`tbl_journals`,jrn,transaction)
 
            for(detail of jrnDetail){
                detail.jrn_id = save
                delete detail.acc_name
                await Tran.create(`tbl_journal_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Journal Created  Successfully.`
            });
    }else{
        let exist = await Tran.countRows(`select jrn_code from tbl_journals where jrn_code=? and jrn_id <> ?  and status= 'a' `,[jrn.jrn_code,jrn.jrn_id], transaction)
    
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Journal Code Already Exists.`
            });
            return false
        }
        let jrn_id = jrn.jrn_id;
        delete jrn.action;
        delete jrn.jrn_id;

        await Tran.update(`tbl_journals`,jrn,{jrn_id},transaction)

        await Tran.delete(`tbl_journal_details`,{jrn_id},transaction)
  
            for(detail of jrnDetail){
                detail.jrn_id = jrn_id
                delete detail.acc_name
                delete detail.jrn_d_id
                await Tran.create(`tbl_journal_details`,detail,transaction)
             }
             
            await transaction.commit();
            res.json({
                error:false,
                msg:`Journal  updated successfully.`
            });
    }

}
catch (err) {
    await transaction.rollback();
    next(err);
   }
    
});



router.post(`/api/save-debitor-receipt`,async(req,res,next)=>{

    let transaction; 
        try{
            transaction = await Tran.sequelize.transaction();

            let rcv = req.body.rcv;
            let para = req.body;
            let rcvDetail = req.body.rcvDetail;
                rcv.creation_by = req.user.user_id;
                rcv.branch_id = req.user.user_branch_id;
    if(rcv.action == 'create'){
        let exist = await Tran.countRows(`select rcv_code from tbl_debitor_receipts where rcv_code=?  and status= 'a'`,[rcv.rcv_code], transaction)
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Receipt code Already Exists.`
            });
            return false
        }

        delete rcv.action;
        delete rcv.rcv_id;
        let [save, _]  = await Tran.create(`tbl_debitor_receipts`,rcv,transaction)

            for(detail of rcvDetail){
                detail.rcv_id = save
                delete detail.acc_name
                delete detail.from_acc_name
                delete detail.into_acc_name

                delete detail.direct_income_acc_name
                delete detail.current_liability_acc_name
                delete detail.emi_name
                delete detail.amount
                delete detail.emi_no
                await Tran.create(`tbl_debitor_receipt_details`,detail,transaction)

             }
            
            await transaction.commit();


            // if(para.contact_no.trim() != '' && para.is_smg == 'yes'){
            //     await axios.post(`https://mshastra.com/sendsms_api_json.aspx`,[{
            //         "user":"MamudEnter",
            //         "pwd":"uy4_u1u_",
            //         "number":"88"+para.contact_no,
            //         "msg":para.msg,
            //         "sender":"8809617642241",
            //         "language":"Unicode/English"
            //     }]).then(res=>{
            //         console.log(res.data)
            //     })
            // }

            

            res.json({
                error:false,
                msg:`Receipt created  Successfully.`,
                id:save
            });

    }else{
        let exist = await Tran.countRows(`select rcv_code from tbl_debitor_receipts where rcv_code=? and rcv_id <> ?  and status= 'a' `,[rcv.rcv_code,rcv.rcv_id], transaction)
    
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Receipt Code Already Exists.`
            });
            return false;
        }
        let rcv_id = rcv.rcv_id;
        delete rcv.action;
        delete rcv.rcv_id;

        await Tran.update(`tbl_debitor_receipts`,rcv,{rcv_id},transaction)

        await Tran.delete(`tbl_debitor_receipt_details`,{rcv_id},transaction)

            for(detail of rcvDetail){

                detail.rcv_id = rcv_id
                delete detail.acc_name
                delete detail.rcv_d_id
                delete detail.from_acc_name
                delete detail.into_acc_name
                delete detail.direct_income_acc_name
                delete detail.current_liability_acc_name
                delete detail.emi_name
                delete detail.amount
                delete detail.emi_no

                await Tran.create(`tbl_debitor_receipt_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:` Receipt  updated successfully.`,
                id: rcv_id
            });
        
    }


    }
    catch (err) {
        await transaction.rollback();
        next(err);
    }


    
});


router.post(`/api/save-creditor-payment`,async(req,res,next)=>{

    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let pay = req.body.pay;
    let payDetail = req.body.payDetail
        pay.creation_by = req.user.user_id;
        pay.branch_id = req.user.user_branch_id;
    if(pay.action == 'create'){
        // Create
        let exist = await Tran.countRows(`select pay_code from tbl_creditor_payments where pay_code=?  and status= 'a' `,[pay.pay_code], transaction)
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Payment code Already Exists.`
            });
            return false
        }

        delete pay.action;
        delete pay.pay_id;
        let [save, _]  = await Tran.create(`tbl_creditor_payments`,pay,transaction)
      
  
            for(detail of payDetail){
                detail.pay_id = save,
                delete detail.acc_name
                delete detail.from_acc_name
                delete detail.to_acc_name

                delete detail.direct_income_acc_name
                delete detail.current_liability_acc_name

                await Tran.create(`tbl_creditor_pay_details`,detail,transaction)
             }
               
                await transaction.commit();
                res.json({
                    error:false,
                    msg:`Payment created  Successfully.`
                });
    }else{
        // Update
        let exist = await Tran.countRows(`select pay_code from tbl_creditor_payments where pay_code=? and pay_id <> ?  and status= 'a'`,[pay.pay_code,pay.pay_id], transaction)

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Payment Code Already Exists.`
            });
            return false
        }
        let pay_id = pay.pay_id;
        delete pay.action;
        delete pay.pay_id;
 
        await Tran.update(`tbl_creditor_payments`,pay,{pay_id: pay_id},transaction)
    
        await Tran.delete(`tbl_creditor_pay_details`,{pay_id:pay_id},transaction)

            for(detail of payDetail){
                detail.pay_id = pay_id
                delete detail.acc_name
                delete detail.pay_d_id
                delete detail.from_acc_name
                delete detail.to_acc_name
                delete detail.direct_income_acc_name
                delete detail.current_liability_acc_name
                await Tran.create(`tbl_creditor_pay_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Payment  updated successfully.`
            });
    }
}
catch (err) {
    await transaction.rollback();
    next(err);
   }
});


router.post(`/api/get-journal-code`,async(req,res,next)=>{
    let [jrnErr,jrn] =  await _p(db.query(`select jrn_id   from tbl_journals   order by jrn_id desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'JRN-1'
    if(jrnErr && !jrn) return next(jrnErr);
    if(jrn.length != 0){
        code = 'JRN-'+parseFloat(jrn[0].jrn_id +parseFloat(1)) 
    }
    res.json(code);

});


router.post(`/api/get-contra-code`,async(req,res,next)=>{
    let [contraErr,contra] =  await _p(db.query(`select contra_id    from tbl_contra_trans  
 
     order by contra_id  desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'CON-1'
    if(contraErr && !contra) return next(contraErr);
    if(contra.length != 0){
        code = 'CON-'+parseFloat(contra[0].contra_id  +parseFloat(1)) 
    }
    res.json(code);

});

let creditorCode = async (req,res,next)=>{
    let [payErr,pay] =  await _p(db.query(`select pay_id     from tbl_creditor_payments  
    
     order by pay_id   desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'PAY-1'
    if(payErr && !pay) return next(payErr);
    if(pay.length != 0){
        code = 'PAY-'+parseFloat(pay[0].pay_id   +parseFloat(1)) 
    }

    return code
}


let branchTranCode = async (req,res,next)=>{
    let [payErr,pay] =  await _p(db.query(`select tran_id     from tbl_branch_transactions  
     order by tran_id   desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'BT-1'
    if(payErr && !pay) return next(payErr);
    if(pay.length != 0){
        code = 'BT-'+parseFloat(pay[0].tran_id+parseFloat(1)) 
    }

    return code
}



router.post(`/api/get-branch-tran-code`,async(req,res,next)=>{
   let code =  await branchTranCode(req,res,next);
    res.json(code);
});


router.post(`/api/get-creditor-payment-code`,async(req,res,next)=>{
   
    res.json(await creditorCode());

});

router.post(`/api/get-debitor-receipt-code`,async(req,res,next)=>{
    let [rcvErr,rcv] =  await _p(db.query(`select rcv_id     from tbl_debitor_receipts  
 
     order by rcv_id   desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'RCV-1'
    if(rcvErr && !rcv) return next(rcvErr);
    if(rcv.length != 0){
        code = 'RCV-'+parseFloat(rcv[0].rcv_id   +parseFloat(1)) 
    }
    res.json(code);
});

router.post(`/api/get-expense-code`,async(req,res,next)=>{
    let [expErr,exp] =  await _p(db.query(`select exp_id    from tbl_expenses   order by exp_id  desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'PAY-1'
    if(expErr && !exp) return next(expErr);
    if(exp.length != 0){
        code = 'PAY-'+parseFloat(exp[0].exp_id +parseFloat(1)) 
    }
    res.json(code);
});

router.post(`/api/get-income-code`,async(req,res,next)=>{
    let [expErr,exp] =  await _p(db.query(`select inc_id     from tbl_incomes    order by inc_id   desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'RCV-1'
    if(expErr && !exp) return next(expErr);
    if(exp.length != 0){
        code = 'RCV-'+parseFloat(exp[0].inc_id  +parseFloat(1)) 
    }
    res.json(code);
});



router.post(`/api/get-item-code`,async(req,res,next)=>{
    let [itemErr,item] =  await _p(db.query(`select item_id  from tbl_items   order by item_id desc limit 1 `).then(res=>{
        return res;
    }))
    let code = 'P0001'
    if(itemErr && !item) return next(itemErr);
    if(item.length != 0){
        code = 'P000'+parseFloat(item[0].item_id+parseFloat(1)) 
    }
    res.json(code);

});


router.get(`/api/get-institution`,async(req,res,next)=>{
    let [institutionErr,institution] =  await _p(db.query(`select currency,pro_name,pro_desc,pro_logo,pro_print_type,is_warehouse,is_cal_type,is_serial,is_voucher_receipt,is_auto_challan,pad_status,is_minus_stock_sale from tbl_institution_profile where pro_branch_id = ? `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(institutionErr && !institution) return next(institutionErr);
    res.json(institution[0]);

});
router.get(`/public/get-institution`,async(req,res,next)=>{
    let [institutionErr,institution] =  await _p(db.query(`select pro_name,pro_desc,pro_logo,pro_print_type,is_voucher_receipt,is_auto_challan,pad_status,is_minus_stock_sale from tbl_institution_profile  order by  pro_id asc limit 1 `).then(res=>{
        return res;
    }));


    if(institutionErr && !institution) return next(institutionErr);
    res.json(institution[0]);

});

router.post(`/api/save-institution`,async(req,res,next)=>{

    
    uploadSingleImage(req,res,async (err)=>{

        if (err instanceof multer.MulterError) {

            res.json(err)
            return false
          // A Multer error occurred when uploading.
        } else if (err) {

            res.json(err)
            return false
          // An unknown error occurred when uploading.
        }

        if(req.file != null){

    
                  
            fs.stat(`./uploads/${req.body.prev_pro_logo}`, function (err, stats) {
           
              if (err) {
                  return console.error(err);
              }
           
              fs.unlink(`./uploads/${req.body.prev_pro_logo}`,function(err){
                   if(err) return console.log(err);
              });  
           });



      }

        var pro_logo = ''
    if(req.file == null){
        pro_logo = 'no'


    }else{
        pro_logo =    res.req.file.filename
    }


   let [countErr,count] =  await _p(db.countRows(`select pro_id from tbl_institution_profile where pro_branch_id=? `,[req.user.user_branch_id]).then(res=>{
            return res;
        }))

        if(countErr && !count) return next(countErr);

        if(count>0){

            let saveRow = {
                pro_name: req.body.pro_name,
                pro_desc: req.body.pro_desc,
                pro_print_type: req.body.pro_print_type,
                is_warehouse: req.body.is_warehouse,
                is_cal_type: req.body.is_cal_type,
                is_auto_challan: req.body.is_auto_challan,
                is_minus_stock_sale: req.body.is_minus_stock_sale,
                is_serial: req.body.is_serial,
                is_voucher_receipt: req.body.is_voucher_receipt,
                currency: req.body.currency,
                pro_updated_by: req.user.user_id,
                pro_branch_id: req.user.user_branch_id,
            }
             if(pro_logo!='no'){
                 saveRow.pro_logo = pro_logo
             }
           let [updateErr,update] =  await _p(db.update(`tbl_institution_profile`,saveRow,{
             pro_branch_id: req.user.user_branch_id,
           }));
           if(updateErr && !update){
            return next(updateErr);
           }else{

            req.app.io.emit('profileChanged',{
                msg:'Institution Profile Updated Successfully. Please Login...',
                access:'changed',
                user_id: req.body.user_id
             });


                // res.json({error:false,message:'Institution Profile Update Successfully.'})
           }
        }else{
            let saveRow = {
                pro_name: req.body.pro_name,
                pro_desc: req.body.pro_desc,
                pro_print_type: req.body.pro_print_type,
                pro_updated_by: req.user.user_id,
                pro_branch_id: req.user.user_branch_id,
            }
             if(pro_logo!='no'){
                 saveRow.pro_logo = pro_logo
             }
           let [addErr,add] =  await _p(db.insert(`tbl_institution_profile`,saveRow));
           if(addErr && !add){
            return next(addErr);
           }else{

            req.app.io.emit('profileChanged',{
                msg:'Institution Profile Added Successfully. Please Login...',
                access:'changed',
                user_id: req.body.user_id
             });

            //    res.json({error:false,message:'Institution Profile Add Successfully.'})
           }
        }
        
        // End of code 
    });
   
    
});


router.post('/api/get-branches',async (req,res,next)=>{
    let cluases = ``
    if(req.body['without-self'] != undefined && req.body['without-self'] != null){
        cluases +=` where branch_id <>${req.user.user_branch_id} `
    }

    
    let [qryErr,data] = await _p(db.query(`select * from tbl_branches 
    ${cluases}
    order by branch_status  `).then( rows => {   
                  return rows
      }));
      if(qryErr && !data){
        return next(qryErr);
      }
      else{
          res.json({error:false,message:data});
      }
})

router.post('/api/get-users',async (req,res,next)=>{
    let [qryErr,data] = await _p(db.query(`select u.user_id,u.user_label,u.user_full_name,u.user_name,u.user_email,
    u.user_role,u.user_status,b.branch_name,w.warehouse_name,u.user_branch_id,u.user_warehouse_id,u.acc_type,acc.acc_name,acc.acc_id
     from tbl_users u
     left join tbl_branches b on b.branch_id = u.user_branch_id
     left join tbl_warehouses w on w.warehouse_id = u.user_warehouse_id
     left join tbl_accounts acc on acc.acc_id = u.customer_id
     order by u.user_id desc
      `).then( rows => {   
                  return rows
      }));
      if(qryErr && !data){
        return next(qryErr);
      }
      else{
          res.json({error:false,message:data});
      }
})




router.post('/api/branch-cu',async (req,res,next)=>{
    let reqObj = req.body;

    let defaultAccs = [
        {acc_name:'Discount on sale',acc_type_id:'direct_expense',acc_type_name:'Direct Expense'},
        {acc_name:'Discount on service',acc_type_id:'direct_expense',acc_type_name:'Direct Expense'},
        {acc_name:'Transport Cost on Purchase',acc_type_id:'direct_expense',acc_type_name:'Direct Expense'},
        {acc_name:'Sales',acc_type_id:'sale_account',acc_type_name:'Sales Accounts'},
        {acc_name:'Sales Return',acc_type_id:'sale_return',acc_type_name:'Sales Return'},
        {acc_name:'Discount on purchase',acc_type_id:'direct_income',acc_type_name:'Direct Incomes'},
        {acc_name:'Transport Cost on Sales ',acc_type_id:'direct_income',acc_type_name:'Direct Incomes'},
        {acc_name:'Vat & Tax Account',acc_type_id:'dutie_&_tax',acc_type_name:'Duties & Taxes'},
        {acc_name:'Purchase',acc_type_id:'purchase_account',acc_type_name:'Purchase Accounts'},
        {acc_name:'Purchase Return',acc_type_id:'purchase_return',acc_type_name:'Purchases Return'},
        {acc_name:'Salary',acc_type_id:'indirect_expense',acc_type_name:'Salary'},
        {acc_name:'Cash',acc_type_id:'cash_in_hand',acc_type_name:'Cash-in-Hand'},
        {acc_name:'Capital Account',acc_type_id:'capital',acc_type_name:'Capital'},
        {acc_name:'Services Account',acc_type_id:'service_account',acc_type_name:'Services Account'},
        {acc_name:'Service Expense Account',acc_type_id:'service_expense_account',acc_type_name:'Service Expense Account'},

    ]


    if(reqObj.action=='create'){

        let [,countBranch] =  await _p(db.countRows(`select * from tbl_branches  `)).then(row=>{
            return row;
        });

        if(countBranch == 0){
   
            let shunks = tokenSession.generate(config.license_key);
            let token = `${shunks.salt}.${shunks.hash}.${shunks.timestamp}`;

             await _p(db.insert('tbl_watch_token',{
                token : token
             })).then(res=>{
                return res;
            });
        }
        let [,checkDuplicate] =  await _p(db.countRows(`select * from tbl_branches where branch_name=? `,[reqObj.branch_name])).then(row=>{
            return row;
        });
        if(checkDuplicate>0){
            res.json({
                error:true,
                message:'Branch Name Already Exists !!!'
            })
           return false
        }
    }


    if(reqObj.action=='update'){
        let [checkDuplicateErr,checkDuplicate] =  await _p(db.countRows(`select * from tbl_branches where branch_name=?  and branch_id<>?`,[reqObj.branch_name,reqObj.branch_id])).then(row=>{
            return row;
        });
        if(checkDuplicate>0){
            res.json({
                error:true,
                message:'Branch Name Already Exists !!!'
            })
           return false
        }
    }
    



    let branchUpdateIndex = req.body.branchUpdateIndex;
     let newObject = {
        branch_created_by:req.user.user_id,
        branch_updated_by:req.user.user_id,
        branch_status:'active',
        branch_created_isodt:getCurrentISODT(),
        branch_updated_isodt:getCurrentISODT()
     }
     let saveObj = Object.assign(reqObj,newObject)


     

     // Create script
     if(reqObj.action=='create'){
            delete saveObj.branch_id;
            delete saveObj.action;
            delete saveObj.branchUpdateIndex;
            delete saveObj.branch_updated_isodt;

        let [branchAddErr,branchAddResult] = await _p(db.insert('tbl_branches',saveObj)).then(res=>{
            return res;
        });
        if(branchAddErr && !branchAddResult){
           next(branchAddErr)
        }else{
           let [createdRowErr,createdRow] =  await _p(db.query(`select * from tbl_branches where branch_id=?`,branchAddResult.insertId)).then(row=>{
                return row;
            })
            if(createdRowErr && !createdRow){
               next(createdRowErr);
            }else{

            
    
                defaultAccs.map(async (acc)=>{
                    acc.branch_id = branchAddResult.insertId
                    acc.status = 'a'
                    acc.create_by = req.user.user_id
                    
                    let [accErr,accResult] = await _p(db.insert('tbl_accounts',acc)).then(res=>{
                        return res;
                    });
    
                });


                let [accErr,accResult] = await _p(db.insert('tbl_institution_profile',{
                    pro_name : `Branch Name`,
                    pro_desc : `Branch Description`,
                    pro_print_type : `a4`,
                    pro_updated_by : req.user.user_id,
                    pro_branch_id : branchAddResult.insertId,
                    is_warehouse : 'no',
                    is_cal_type : 'on_total',
                    is_serial : 'no',
                    currency : 'ccy.',
                })).then(res=>{
                    return res;
                });


               req.app.io.emit('createdBranch',{
               msg:'You have successfully created a branch',
               createdRow,
               index:branchUpdateIndex,
               user_branch_id: req.user.user_branch_id,
              
            });
               res.json({
                   error:false,
                   message:'You have successfully created a branch'
               })
            }
        }
     }
     // Update script
     if(reqObj.action=='update'){         
         let cond = {
            branch_id:reqObj.branch_id
         }
        delete saveObj.action;
        delete saveObj.branchUpdateIndex;
        delete saveObj.branch_created_isodt;
        let [branchUpdateErr,branchUpdateResult] = await _p(db.update('tbl_branches',saveObj,cond)).then(res=>{
            return res;
        });
        if(branchUpdateErr && !branchUpdateResult){
           next(branchUpdateErr)
        }else{
           let [updatedRowErr,updatedRow] =  await _p(db.query(`select * from tbl_branches where branch_id=?`,reqObj.branch_id)).then(row=>{
                return row;
            })
            if(updatedRowErr && !updatedRow){
               next(updatedRowErr);
            }else{



                defaultAccs.map(async (acc)=>{
                    acc.branch_id = reqObj.branch_id
                    acc.status = 'a'
                    acc.create_by = req.user.user_id 

                    // Check
                    let [checkErr,check] =  await _p(db.countRows(`select * from tbl_accounts where acc_name=?`,acc.acc_name)).then(row=>{
                        return row;
                    })
                    //

                    if(check == 0){
                        let [accErr,accResult] = await _p(db.insert('tbl_accounts',acc)).then(res=>{
                            return res;
                        });
                    }
                    
                 
    
                });



               req.app.io.emit('updatedBranch',{
               msg:'You have successfully update a branch',
               updatedRow,
               index:branchUpdateIndex,
               user_branch_id: req.user.user_branch_id,
              });
               res.json({
                   error:false,
                   message:'You have successfully updated a branch'
               })
            }
        }
     }
     
})




router.post(`/api/save-pad-status`,async(req,res,next)=>{


    await _p(db.update('tbl_institution_profile',{pad_status:req.body.padStatus},{pro_branch_id : req.user.user_branch_id})).then(res=>{
        return res;
    });

    res.json({
        error:false,
        message:`You have successfully ${req.body.action} a branch`
    })
})




router.post('/api/branch-disable-restore',async (req,res,next)=>{
    let saveEnum = "";
   
    if(req.body.action=='disable'){
        saveEnum = 'deactivated'
    }
    if(req.body.action=='restore'){
        saveEnum = 'active'
    }
    if(req.body.action=='disable' || req.body.action=='restore'){
        let cond = {
            branch_id:req.body.branch_id
        }
        
       let [branchRestoreErr,branchDisRestoreResult] = await _p(db.update('tbl_branches',{branch_status:saveEnum},cond)).then(res=>{
           return res;
       });
       if(branchRestoreErr && !branchDisRestoreResult){
          next(branchRestoreErr)
       }else{
          let [disableRestoreErr,disableRestoreRow] =  await _p(db.query(`select * from tbl_branches where branch_id=?`,req.body.branch_id)).then(row=>{
               return row;
           })
           if(disableRestoreErr && !disableRestoreRow){
              next(disableRestoreErr);
           }else{
              req.app.io.emit('disableRestoreBranch',{
              msg:`You have successfully ${req.body.action} a branch`,
              disableRestoreRow,
              index:req.body.index,
              user_branch_id: req.user.user_branch_id,
             
            });
              res.json({
                  error:false,
                  message:`You have successfully ${req.body.action} a branch`
              })
           }
       }
    }
})






router.post('/api/user-disable-restore',async (req,res,next)=>{
    let saveEnum = "";
    if(req.body.action=='disable'){
        saveEnum = 'deactivated'
    }
    if(req.body.action=='restore'){
        saveEnum = 'active'
    }
    if(req.body.action=='disable' || req.body.action=='restore'){

        let cond = {
            user_id:req.body.user_id
        }
        
       let [userRestoreErr,userDisRestoreResult] = await _p(db.update('tbl_users',{user_status:saveEnum},cond)).then(res=>{
           return res;
       });
       if(userRestoreErr && !userDisRestoreResult){
          next(userRestoreErr)
       }else{
              res.json({
                  error:false,
                  message:`You have successfully ${req.body.action} user`
              })
           
       }
    }
})



router.post('/api/get-warehouses',async (req,res,next)=>{
    let cluases = " ";
  
    let [warehousesError,warehouses] =  await _p(db.query(`select * from tbl_warehouses    
    ${cluases}   

    where  warehouse_status='active'

    order by warehouse_id

 
    
    `)).then(result=>{
        return result;
    });
    if(warehousesError && !warehouses){
        next(warehousesError)
    }else{
        res.json({
            error:false,
            message:warehouses
        });
    }
});
 


router.post('/api/warehouse-cu',async (req,res,next)=>{
    let reqObj = req.body;
    if(reqObj.action=='create'){
        let [checkDuplicateErr,checkDuplicate] =  await _p(db.countRows(`select * from tbl_warehouses where warehouse_name=?  and warehouse_status='active' `,[reqObj.warehouse_name])).then(row=>{
            return row;
        });
        if(checkDuplicate>0){
            res.json({
                error:true,
                message:'Warehouse Name Already Exists !!!'
            })
           return false
        }
    }


    if(reqObj.action=='update'){
        let [checkDuplicateErr,checkDuplicate] =  await _p(db.countRows(`select * from tbl_warehouses where warehouse_name=? and warehouse_id<>? and warehouse_status='active'`,[reqObj.warehouse_name,reqObj.warehouse_id])).then(row=>{
            return row;
        });
        if(checkDuplicate>0){
            res.json({
                error:true,
                message:'Warehouse Name Already Exists !!!'
            })
           return false
        }
    }
    
    let warehouseUpdateIndex = req.body.warehouseUpdateIndex;
     let newObject = {
        warehouse_created_by:req.user.user_id,
        warehouse_updated_by:req.user.user_id,
        warehouse_status:'active',
        warehouse_created_isodt:getCurrentISODT(),
        warehouse_updated_isodt:getCurrentISODT()
     }
     let saveObj = Object.assign(reqObj,newObject)

     // Create script
     if(reqObj.action=='create'){
            delete saveObj.warehouse_id;
            delete saveObj.action;
            delete saveObj.warehouseUpdateIndex;
            delete saveObj.warehouse_updated_isodt;

        let [warehouseAddErr,warehouseAddResult] = await _p(db.insert('tbl_warehouses',saveObj)).then(res=>{
            return res;
        });
        if(warehouseAddErr && !warehouseAddResult){
           next(warehouseAddErr)
        }else{
            
            


           let [createdRowErr,createdRow] =  await _p(db.query(`select * from tbl_warehouses `,warehouseAddResult.insertId)).then(row=>{
                return row;
            })
            if(createdRowErr && !createdRow){
               next(createdRowErr);
            }else{
               req.app.io.emit('createdWarehouse',{
               msg:'You have successfully created a warehouse',
               createdRow,
               index:warehouseUpdateIndex,
               user_branch_id: req.user.user_branch_id,
              
            });
               res.json({
                   error:false,
                   message:'You have successfully created a warehouse'
               })
            }
        }
     }
     // Update script
     if(reqObj.action=='update'){         
         let cond = {
            warehouse_id:reqObj.warehouse_id
         }
        delete saveObj.action;
        delete saveObj.warehouseUpdateIndex;
        delete saveObj.warehouse_created_isodt;
        let [warehouseUpdateErr,warehouseUpdateResult] = await _p(db.update('tbl_warehouses',saveObj,cond)).then(res=>{
            return res;
        });
        if(warehouseUpdateErr && !warehouseUpdateResult){
           next(warehouseUpdateErr)
        }else{
           let [updatedRowErr,updatedRow] =  await _p(db.query(`select * from tbl_warehouses `,reqObj.warehouse_id)).then(row=>{
                return row;
            })
            if(updatedRowErr && !updatedRow){
               next(updatedRowErr);
            }else{
               req.app.io.emit('updatedWarehouse',{
               msg:'You have successfully update a warehouse',
               updatedRow,
               index:warehouseUpdateIndex,
               user_branch_id: req.user.user_branch_id,
              });
               res.json({
                   error:false,
                   message:'You have successfully updated a warehouse'
               })
            }
        }
     }
     
})


router.post('/api/warehouse-disable-restore',async (req,res,next)=>{
    let saveEnum = "";
   
    if(req.body.action=='disable'){
        saveEnum = 'deactivated'
    }
    if(req.body.action=='restore'){
        saveEnum = 'active'
    }
    if(req.body.action=='disable' || req.body.action=='restore'){
        let cond = {
            warehouse_id:req.body.warehouse_id
        } 
        
       let [warehouseRestoreErr,warehouseDisRestoreResult] = await _p(db.update('tbl_warehouses',{warehouse_status:saveEnum},cond)).then(res=>{
           return res;
       });
       if(warehouseRestoreErr && !warehouseDisRestoreResult){
          next(warehouseRestoreErr)
       }else{
          let [disableRestoreErr,disableRestoreRow] =  await _p(db.query(`select * from tbl_warehouses `,req.body.warehouse_id)).then(row=>{
               return row;
           })
           if(disableRestoreErr && !disableRestoreRow){
              next(disableRestoreErr);
           }else{
              req.app.io.emit('disableRestoreWarehouse',{
              msg:`You have successfully ${req.body.action} a warehouse`,
              disableRestoreRow,
              index:req.body.index,
              user_branch_id: req.user.user_branch_id,
             
            });
              res.json({
                  error:false,
                  message:`You have successfully ${req.body.action} a warehouse`
              })
           }
       }
    }
});

router.post(`/api/get-accounts-by-search`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.query != undefined && req.body.query != null){
        if(req.body.query == ''){
            cluases +=  ` and 0=1`
        }else{
            cluases += ` and ( acc.acc_name like  '%${req.body.query}%' ||  acc.acc_code like  '%${req.body.query}%' ||  acc.contact_no like  '%${req.body.query}%'  ) `
        }
    } 

    if(req.body.type != undefined && req.body.type != null && req.body.type != ''){
        cluases += ` and  acc.acc_type_id =  '${req.body.type}'  `
    } 

    if(req.body.multiType != undefined && req.body.multiType != null && req.body.multiType.length != 0){
        
       let newConds =    "'" + req.body.multiType.join("','") + "'";
        cluases += ` and  acc.acc_type_id in (${newConds})`  
    }
    

    if(req.body.acc_name != undefined && req.body.acc_name != null && req.body.acc_name != ''){
        cluases += ` and  acc.acc_name =  '${req.body.acc_name}'  `
    } 


    
    let [accountsErr,accounts] =  await _p(db.query(`select concat(acc.acc_name,' - ',ifnull(acc.acc_code,''),' - ',ifnull(acc.contact_no,''), ' - ',ifnull(acc.address,'') ) as display_text,
    acc.acc_name,acc.acc_id,acc.contact_no,acc.address,acc.institution_name,
    acc.party_type,acc.employee_id,gp.group_name,gp.component_name,
    acc.acc_type_id
     from tbl_accounts acc
     left join tbl_collection_groups gp on gp.group_id = acc.group_id
     where 
     acc.status = "a" 
     and acc.party_type <> 'general'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});


router.post(`/api/get-branch-accs`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.toBranchId != undefined || req.body.toBranchId != null){
        cluases += ` and  acc.branch_id =  '${req.body.toBranchId}' `
    }


    if(req.body.multiType != undefined && req.body.multiType != null && req.body.multiType.length != 0){
        
        let newConds =    "'" + req.body.multiType.join("','") + "'";
         cluases += ` and  acc.acc_type_id in (${newConds})`
     }
    
    let [accountsErr,accounts] =  await _p(db.query(`select concat(acc.acc_name) as display_text,acc.acc_name,acc.acc_id,acc.contact_no,acc.address,acc.institution_name,acc.party_type,acc.employee_id
    from tbl_accounts acc
    where 
    acc.status = "a" 
    and acc.party_type <> 'general'
    ${cluases}
    order by acc_id  desc
    `).then(res=>{
       return res;
   }))

   res.json(accounts);

})

router.post(`/api/get-accounts-by-type`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.acc_type_id != undefined || req.body.acc_type_id != null){
        cluases += ` and  acc.acc_type_id =  '${req.body.acc_type_id}' `
    }

    if(req.body.acc_name != undefined || req.body.acc_name != null){
        cluases += ` and  acc.acc_name =  '${req.body.acc_name.toLowerCase()}' `
    }
    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.acc_id,acc.acc_name
     from tbl_accounts acc
     where 
     acc.status = "a"
     and acc.branch_id = ?
     ${cluases}
     order by acc.acc_name  asc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});
router.post(`/api/get-accounts`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.search != undefined){
        cluases += ` and  acc.acc_name like  '%${req.body.query}%'  `
    }

    if(req.body.multiTypeNot != undefined && req.body.multiTypeNot != null && req.body.multiTypeNot.length != 0){
        
        let newConds =    "'" + req.body.multiTypeNot.join("','") + "'";
         cluases += ` and  acc.acc_type_id not in (${newConds})`  
     }
    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name,col.group_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_collection_groups col on col.group_id  = acc.group_id 
     where 
     acc.status = "a"
     and acc.party_type <> 'general'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});



router.post(`/api/get-customer-list`,async(req,res,next)=>{

    let cluases = ` `
    

    
    if(req.body.search != undefined){
        cluases += ` and  acc.acc_name like  '%${req.body.query}%'  `
    }


    if(req.user.user_role != 'super_admin'){
        cluases += ` and  acc.create_by =  ${req.user.user_id}  `
    }
  

    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name, IF(acc.status ="p", "Pending", "Approved") as status_text,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status != "d"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'debitor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});


router.post(`/api/get-customers`,async(req,res,next)=>{

    let cluases = ` `
    

    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status = "a"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'debitor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});

router.post(`/api/get-suppliers`,async(req,res,next)=>{

    let cluases = ` `
    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status = "a"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'creditor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});

router.post(`/api/get-pending-customer-list`,async(req,res,next)=>{

    let cluases = ` `
    

    
    if(req.body.search != undefined){
        cluases += ` and  acc.acc_name like  '%${req.body.query}%'  `
    }


    if(req.user.user_role != 'super_admin'){
        cluases += ` and  acc.create_by =  ${req.user.user_id}  `
    }
  

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  acc.create_by =  ${req.body.userId}  `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id =  ${req.body.locationId}  `
    }

    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name, IF(acc.status ="p", "Pending", "Approved") as status_text,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status = "p"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'debitor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});


router.post(`/api/get-approved-customer-list`,async(req,res,next)=>{

    let cluases = ` `
    

    
    if(req.body.search != undefined){
        cluases += ` and  acc.acc_name like  '%${req.body.query}%'  `
    }


    if(req.user.user_role != 'super_admin'){
        cluases += ` and  acc.create_by =  ${req.user.user_id}  `
    }
  

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  acc.create_by =  ${req.body.userId}  `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id =  ${req.body.locationId}  `
    }

    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name, IF(acc.status ="p", "Pending", "Approved") as status_text,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status = "a"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'debitor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});



router.post(`/api/get-rejected-customer-list`,async(req,res,next)=>{

    let cluases = ` `
    
    if(req.body.search != undefined){
        cluases += ` and  acc.acc_name like  '%${req.body.query}%'  `
    }


    if(req.user.user_role != 'super_admin'){
        cluases += ` and  acc.create_by =  ${req.user.user_id}  `
    }
  

    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  acc.create_by =  ${req.body.userId}  `
    }

    if(req.body.locationId != undefined && req.body.locationId != null){
        cluases += ` and  acc.location_id =  ${req.body.locationId}  `
    }

    
    let [accountsErr,accounts] =  await _p(db.query(`select acc.*,l.location_name,emp.employee_name, IF(acc.status ="p", "Pending", "Approved") as status_text,u.user_full_name
     from tbl_accounts acc
     left join tbl_locations l on l.location_id = acc.location_id
     left join tbl_employees emp on emp.employee_id = acc.employee_id
     left join tbl_users u on u.user_id = acc.create_by
     where 
     acc.status = "r"
     and acc.party_type <> 'general'
     and acc.acc_type_id = 'debitor'
     and acc.branch_id = ?
     ${cluases}
     order by acc_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(accountsErr && !accounts) return next(accountsErr);
    res.json(accounts);

});





router.post(`/api/get-user-wise-customer-report`,async(req,res,next)=>{

    let cluases = ` `


    if(req.user.user_role != 'super_admin'){
        cluases += ` and  u.user_id =  ${req.user.user_id}  `
    }

    
    if(req.body.userId != undefined && req.body.userId != null){
        cluases += ` and  u.user_id =  ${req.body.userId}  `
    
    }

    

    let dateCluases = '' 
    if(req.body.fromDate != undefined && req.body.toDate != undefined){
        dateCluases +=  ` between "${req.body.fromDate}" and "${req.body.toDate}" `
    }

///         ${dateCluases != '' ? ` and con.created_date ${dateCluases}` : ''}

  
    let [usersErr,users] =  await _p(db.query(`select 
    u.user_full_name,
    ( 
        select count(DISTINCT(con.customer_id)) from tbl_conversations con  
        left join tbl_accounts acc on acc.acc_id = con.customer_id
        where con.user_id = u.user_id
        ${dateCluases != '' ? ` and con.created_date ${dateCluases}` : ''}
           and     DATE(acc.creation_date) = "${isoFromDate(getCurrentISODT())}"

    ) as totalConvNewCustomer,
    ( 
        select count(DISTINCT(con.customer_id)) 
        from tbl_conversations con 
        left join tbl_accounts acc on acc.acc_id = con.customer_id
        where con.user_id = u.user_id 
        ${dateCluases != '' ? ` and con.created_date ${dateCluases}` : ''} and    acc.creation_date < "${isoFromDate(getCurrentISODT())}"
    ) as totalConvOldwCustomer,

    (
        select count(acc_id) from tbl_accounts acc 
        where 
        acc.create_by = u.user_id
        and acc.status = "p"
        and acc.party_type <> 'general'
        and acc.acc_type_id = 'debitor'
        and acc.branch_id = ${req.user.user_branch_id}
        ${dateCluases != '' ? ` and acc.creation_date ${dateCluases}` : ''} 
    ) as totalPendingCustomer,

    (
        select count(acc_id) from tbl_accounts acc 
        where 
        acc.create_by = u.user_id
        and acc.status = "a"
        and acc.party_type <> 'general'
        and acc.acc_type_id = 'debitor'
        and acc.branch_id = ${req.user.user_branch_id}
        ${dateCluases != '' ? ` and acc.creation_date ${dateCluases}` : ''} 
    ) as totalApprovedCustomer,

    (
        select count(acc_id) from tbl_accounts acc 
        where 
        acc.create_by = u.user_id
        and acc.status = "r"
        and acc.party_type <> 'general'
        and acc.acc_type_id = 'debitor'
        and acc.branch_id = ${req.user.user_branch_id}
        ${dateCluases != '' ? ` and acc.creation_date ${dateCluases}` : ''} 
    ) as totalRejectedCustomer



    from tbl_users u
    where u.user_branch_id = ?
    ${cluases}
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(usersErr && !users) return next(usersErr);
    res.json(users);

});



router.post(`/api/get-locations`,async(req,res,next)=>{
    
    let [locationsErr,locations] =  await _p(db.query(`select location_id,location_name 
     from tbl_locations 
     where 
     status = "a"  
     order by location_id  desc
     `,).then(res=>{
        return res;
    }))

    if(locationsErr && !locations) return next(locationsErr);
    res.json(locations);

});
router.post(`/api/get-item-groups`,async(req,res,next)=>{
    
    let [groupsErr,groups] =  await _p(db.query(`select group_id,group_name 
     from tbl_groups 
     where 
     status = "a"  
     order by group_id  desc
     `,).then(res=>{
        return res;
    }))

    if(groupsErr && !groups) return next(groupsErr);
    res.json(groups);

});
router.post(`/api/get-item-categories`,async(req,res,next)=>{
    
    let [categoriesErr,categories] =  await _p(db.query(`select category_id,category_name 
     from tbl_categories 
     where 
     status = "a"  
     order by category_id   desc
     `,).then(res=>{
        return res;
    }))

    if(categoriesErr && !categories) return next(groupsErr);
    res.json(categories);
});



router.post(`/api/get-item-origins`,async(req,res,next)=>{
    
    let [originsErr,origins] =  await _p(db.query(`select origin_id,origin_name 
     from tbl_origins 
     where 
     status = "a"  
     order by origin_id   desc
     `,).then(res=>{
        return res;
    }))

    if(originsErr && !origins) return next(originsErr);
    res.json(origins);
});


router.post(`/api/get-item-models`,async(req,res,next)=>{
    
    let [modelsErr,models] =  await _p(db.query(`select model_id,model_name 
     from tbl_models 
     where 
     status = "a"  
     order by model_id   desc
     `,).then(res=>{
        return res;
    }))

    if(modelsErr && !models) return next(modelsErr);
    res.json(models);
});


router.post(`/api/get-due-emis`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.customerId != undefined || req.body.customerId != null ){
        cluases += ` and emi.cus_id = ${req.body.customerId} `
    }

    if(req.body.dateTo != undefined || req.body.dateTo != null ){
        cluases += ` and emi.from_date < '${req.body.dateTo}' `
    }
    
    let [duesErr,dues] =  await _p(db.query(`
    
    select * from (
         
            select emi.emi_id,emi.from_date,emi.last_date,emi.emi_no,emi.amount,
            acc.acc_name,acc.contact_no,
            (
                select ifnull(sum(rd.rcv_total),0) from tbl_debitor_receipt_details rd 
                where rd.emi_id = emi.emi_id and rd.status = 'a'
            )  as paid,
            (
                select emi.amount - paid 
            ) as due
            from tbl_emis emi 
            left join tbl_accounts acc on acc.acc_id = emi.cus_id
            where 
            emi.status = "a"  
            ${cluases}
            

    ) as tbl where 1=1 
      and due != 0

      order by from_date   asc
     
     `,).then(res=>{
        return res;
    }))

    if(duesErr && !dues) return next(duesErr);
    
    res.json(dues);
});

router.post(`/api/get-item-units`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.type != undefined && req.body.type == 'base_unit'){
        cluases = ` and u.is_multi_unit = 'no' `
    }
    let [unitsErr,units] =  await _p(db.query(`select u.*,
        (
        select unit_symbol  from tbl_item_units  bu where bu.unit_id = u.base_unit_id
        ) as base_unit_name
     from tbl_item_units u
     where 
     u.status = "a"  ${cluases}
     order by u.unit_id desc
     `,).then(res=>{
        return res;
    }))

    if(unitsErr && !units) return next(unitsErr);
    res.json(units);

});



router.post('/api/check-serial-number',async(req,res,next)=>{
    let [checkErr,check] =  await _p(db.countRows(`select serial_number from tbl_item_serials where serial_number = ? `,[req.body.serial_number]).then(res=>{
        return res;
    }))

    if(checkErr && !check) return next(checkErr);

    if(check > 0 ){
        res.json({
            error:true,
            message:'Serial number Exists.'
        });
    }else{
        res.json({
            error:false
        });
    }

})



router.post(`/api/get-items-by-search`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined && req.body.query != null){
        if(req.body.query == ''){
            cluases +=  ` and 0=1`
        }else{
            cluases += ` and  (it.item_name like  '%${req.body.query}%' ||   it.item_code like  '%${req.body.query}%') `
        }
    }

    let rateCluase = ` `

    if(req.body.partyType != undefined && req.body.partyType != null){
        if(req.body.partyType == 'retailer' || req.body.partyType == 'sale_rate' || req.body.partyType == 'general' || req.body.partyType == 'no'){
            rateCluase =  ` ,ifnull(it.sale_rate,0) as item_rate `
        }

        if(req.body.partyType == 'wholesaler'){
            rateCluase =  ` ,ifnull(it.wholesaler_rate,0) as item_rate `
        }

       

        if(req.body.partyType == 'distributor'){
            rateCluase =  ` ,ifnull(it.distributor_rate,0) as item_rate `
        }

        if(req.body.partyType == 'corporate'){
            rateCluase =  ` ,ifnull(it.corporate_rate,0) as item_rate `
        }

       
    }

    let [itemsErr,items] =  await _p(db.query(`select concat(it.item_name,' - ',ifnull(it.item_code,''),' - ',ifnull(it.item_barcode,'')) as display_text,it.discount_per,it.tax_per,it.is_serial,it.is_service,it.item_name,it.item_id,acc.acc_name,
          ut.unit_name,ut.unit_id,ut.unit_symbol,ut.base_unit_id,ut.conversion,it.photo,
          it.purchase_rate,
       (
        select unit_symbol  from tbl_item_units   where unit_id = ut.base_unit_id
        ) as base_unit_name,
        m.model_name,
        ori.origin_name
        ${rateCluase}
     from tbl_items it
     left join tbl_accounts acc on acc.acc_id = it.tax_acc_id
     left join tbl_item_units ut on ut.unit_id = it.unit_id
     left join tbl_models m on m.model_id = it.model_id
     left join tbl_origins ori on ori.origin_id = it.origin_id
     where 
     it.status = "a"  
     and find_in_set(?,it.branch_ids)  
     ${cluases}
     order by it.item_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    items =  items.map((item)=>{
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
 


        item.units = item.conversion > 1 ? unitTwo.concat(unitOne) : unitOne

        return item

    })

    if(itemsErr && !items) return next(itemsErr);
    res.json(items);

});

router.post(`/api/get-items`,async(req,res,next)=>{
    let cluases = ` `
    
    if(req.body.itemId != undefined ){
        cluases = ` and  it.item_id =  ${req.body.itemId}  `
    }


    let [itemsErr,items] =  await _p(db.query(`select it.*,acc.acc_name,gp.group_name,ct.category_name,
          ut.unit_name,ut.unit_symbol,ut.base_unit_id,
       (
        select unit_symbol  from tbl_item_units   where unit_id = ut.base_unit_id
        ) as base_unit_name,
        m.model_name,
        ori.origin_name

     from tbl_items it
     left join tbl_accounts acc on acc.acc_id = it.tax_acc_id
     left join tbl_groups gp on gp.group_id = it.group_id
     left join tbl_categories ct on ct.category_id = it.category_id
     left join tbl_models m on m.model_id = it.model_id
     left join tbl_origins ori on ori.origin_id = it.origin_id
     left join tbl_item_units ut on ut.unit_id = it.unit_id
     where 
     it.status = "a"  
     and find_in_set(?,it.branch_ids)    
     ${cluases}
     order by it.item_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(itemsErr && !items) return next(itemsErr);
    res.json(items);

});
 



router.post(`/api/save-conversation`,async(req,res,next)=>{
    let payLoad = req.body;

       payLoad.created_date = getCurrentISODT();
       payLoad.user_id = req.user.user_id;
      
        let [saveErr,save] = await _p(db.insert('tbl_conversations',payLoad)).then(res=>{
            return res;
        });

        res.json({
            error:true,
            msg:`Saved`
        });
       
    
});

router.post(`/api/customer-status-change`,async(req,res,next)=>{
    let payLoad = req.body;

       
      
        let [saveErr,save] = await _p(db.update('tbl_accounts',{
            status: payLoad.status
        },{acc_id : payLoad.customerId})).then(res=>{
            return res;
        });

        res.json({
            error:true,
            msg:`changed`
        });
       
    
});


router.post(`/api/save-customer-collection`,async(req,res,next)=>{
      
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        let payLoad = req.body;

        for(cus of payLoad.customers){
            let obj = {
                acc_id : cus.acc_id,
                into_acc_id : payLoad.into_acc_id,
                created_date : payLoad.toDate,
                amount : cus.collected_amount,
                created_by : req.user.user_id,
                branch_id : req.user.user_branch_id
            }

            let exist = await Tran.selectByCond(` select * from tbl_debtor_collections 
            where acc_id=? and  DATE(created_date) = '${isoFromDate(payLoad.toDate)}' and branch_id = ? `,[cus.acc_id,req.user.user_branch_id], transaction)

            if(exist.length > 0){
                // update
                delete obj.created_by
                 await Tran.update(`tbl_debtor_collections`,obj,{coll_id : exist[0].coll_id},transaction)
            }else{
               await Tran.create(`tbl_debtor_collections`,obj,transaction)
            }
        }

        await transaction.commit();

        res.json({
            error:false,
            msg:`Create successful.`
        });

    }catch (err) {
    await transaction.rollback();
    next(err);
   }

});

router.post(`/api/save-category-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select category_name from tbl_categories where category_name=? and status= 'a' `,[payLoad.category_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Category Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.category_id;
        let [saveErr,save] = await _p(db.insert('tbl_categories',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item category create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select category_name from tbl_categories where category_name=? and category_id != ? and status= 'a' `,[payLoad.category_name,payLoad.category_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Category Name Already Exist.`
            });
            return false
        }

        let category_id = payLoad.category_id;
        delete payLoad.action;
        delete payLoad.category_id;
        let [saveErr,save] = await _p(db.update('tbl_categories',payLoad,{category_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Category update successful.`
            });
        }
    }
    
});

router.post(`/api/save-model-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select model_name 
        from tbl_models 
        where model_name=? and status= 'a' `,[payLoad.model_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Model Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.model_id;
        let [saveErr,save] = await _p(db.insert('tbl_models',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Model create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select model_name from tbl_models where model_name=? and model_id != ? and status= 'a' `,[payLoad.model_name,payLoad.model_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Model Name Already Exist.`
            });
            return false
        }

        let id = payLoad.model_id;
        delete payLoad.action;
        delete payLoad.model_id;
        let [saveErr,save] = await _p(db.update('tbl_models',payLoad,{model_id : id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Model update successful.`
            });
        }
    }
    
});



router.post(`/api/save-origin-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select origin_name 
        from tbl_origins 
        where origin_name=? and status= 'a' `,[payLoad.origin_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item origin Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.origin_id;
        let [saveErr,save] = await _p(db.insert('tbl_origins',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item origin create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select origin_name from tbl_origins where origin_name=? and origin_id != ? and status= 'a' `,[payLoad.origin_name,payLoad.origin_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item origin Name Already Exist.`
            });
            return false
        }

        let id = payLoad.origin_id;
        delete payLoad.action;
        delete payLoad.origin_id;
        let [saveErr,save] = await _p(db.update('tbl_origins',payLoad,{origin_id : id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item origin update successful.`
            });
        }
    }
    
});


router.post(`/api/save-group-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select group_name from tbl_groups where group_name=? and status= 'a' `,[payLoad.group_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Group Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.group_id;
        let [saveErr,save] = await _p(db.insert('tbl_groups',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item group create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select group_name from tbl_groups where group_name=? and group_id != ? and status= 'a' `,[payLoad.group_name,payLoad.group_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Group Name Already Exist.`
            });
            return false
        }

        let group_id = payLoad.group_id;
        delete payLoad.action;
        delete payLoad.group_id;
        let [saveErr,save] = await _p(db.update('tbl_groups',payLoad,{group_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Group update successful.`
            });
        }
    }
    
});




router.post(`/api/save-collection-group`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;

        
 
        let ids = ``

        payLoad.employees.map((emp)=>{
            ids += emp.employee_id+',' 
        })
        delete payLoad.employees;

        payLoad.employee_ids  = ids.replace(/,\s*$/, "")

    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select group_name from tbl_collection_groups 
        where group_name=? and status= 'a' `,[payLoad.group_name])).then(res=>{
            return res;
        });
 
        if(exist > 0 ){
            res.json({
                error:true,
                msg:` Group Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.group_id;
        let [saveErr,save] = await _p(db.insert('tbl_collection_groups',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Group create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select group_name from tbl_collection_groups where
         group_name=? and group_id != ? and status= 'a' `,[payLoad.group_name,payLoad.group_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:` Group Name Already Exist.`
            });
            return false
        }

        let group_id = payLoad.group_id;
        delete payLoad.action;
        delete payLoad.group_id;
        let [saveErr,save] = await _p(db.update('tbl_collection_groups',payLoad,{group_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:` Group update successful.`
            });
        }
    }
    
});
router.post(`/api/save-unit-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select unit_name from tbl_item_units where unit_name=? and status= 'a' `,[payLoad.unit_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Unit Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.unit_id;
        let [saveErr,save] = await _p(db.insert('tbl_item_units',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Unit create successful.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select unit_name from tbl_item_units where unit_name=? and unit_id != ? and status= 'a' `,[payLoad.unit_name,payLoad.unit_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Item Unit Name Already Exist.`
            });
            return false
        }

        let unit_id = payLoad.unit_id;
        delete payLoad.action;
        delete payLoad.unit_id;
        let [saveErr,save] = await _p(db.update('tbl_item_units',payLoad,{unit_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Item Unit update successful.`
            });
        }
    }
    
});
router.post(`/api/save-location-manage`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select location_name from tbl_locations where 
        location_name=? and status= 'a' `,[payLoad.location_name])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Location Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.location_id;
        let [saveErr,save] = await _p(db.insert('tbl_locations',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Location created successfully.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select location_name from tbl_locations where location_name=? and location_id != ? and status= 'a' `,[payLoad.location_name,payLoad.location_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Location Name Already Exists.`
            });
            return false
        }

        let location_id = payLoad.location_id;
        delete payLoad.action;
        delete payLoad.location_id;
        let [saveErr,save] = await _p(db.update('tbl_locations',payLoad,{location_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Location updated successfully.`
            });
        }
    }
    
});


router.post(`/api/delete-item-unit`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_item_units',{status:'d'},{unit_id:req.body.unit_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Item Unit delete successful.`
        });
    }
})


router.post(`/api/delete-item-origin`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_origins',{status:'d'},{origin_id:req.body.origin_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Item Origin delete successful.`
        });
    }
})

router.post(`/api/delete-item-model`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_models',{status:'d'},{model_id:req.body.model_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Item Model delete successful.`
        });
    }
})


router.post(`/api/delete-account`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_accounts',{status:'d'},{acc_id :req.body.acc_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Account deleted successfully.`
        });
    }
})


router.post(`/api/delete-contra`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_contra_trans',{status:'d'},{contra_id  :req.body.contra_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Contra deleted successfully.`
        });
    }
})


router.post(`/api/delete-advance-tran`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_advance_transactions',{tran_status:'d'},{tran_id  :req.body.tran_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Advance transaction deleted successfully.`
        });
    }
})

router.post(`/api/delete-branch-tran`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        await Tran.update(`tbl_branch_transactions`,{status:'d'},{tran_id:req.body.tran_id},transaction)
        
        await transaction.commit();
        res.json({
            error:false,
            msg:`Branch Transaction deleted successfully.`
        });
        
    }catch (err) {
    await transaction.rollback();
    next(err);
   }
})

router.post(`/api/approve-branch-tran`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_branch_transactions',{status:'a'},{tran_id  :req.body.tranId })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Branch Transaction Approved successfully.`
        });
    }
})

router.post(`/api/delete-journal`,async(req,res,next)=>{

    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    await Tran.update(`tbl_journals`,{status:'d'},{jrn_id  :req.body.jrn_id },transaction)
    await Tran.update(`tbl_journal_details`,{status:'d'},{jrn_id  :req.body.jrn_id },transaction)

    await transaction.commit();
    res.json({
        error:false,
        msg:`Journal deleted successfully.`
    });
}
catch (err) {
    await transaction.rollback();
    next(err);
   }
})

router.post(`/api/delete-creditor-payment`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        await Tran.update(`tbl_creditor_payments`,{status:'d'},{pay_id   :req.body.pay_id  },transaction)
        await Tran.update(`tbl_creditor_pay_details`,{status:'d'},{pay_id   :req.body.pay_id  },transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Creditor deleted successfully.`
        });

    }
    catch (err) {
        await transaction.rollback();
        next(err);
    }
})

router.post(`/api/delete-debitor-receipt`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        await Tran.update(`tbl_debitor_receipts`,{status:'d'},{rcv_id:req.body.rcv_id},transaction)
        await Tran.update(`tbl_debitor_receipt_details`,{status:'d'},{rcv_id:req.body.rcv_id},transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Debitor deleted successfully.`
        });
    }
    catch (err) {
        await transaction.rollback();
        next(err);
       }
})


router.post(`/api/delete-location`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_locations',{status:'d'},{location_id  :req.body.location_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Location deleted successfully.`
        });
    }
})
router.post(`/api/delete-item-group`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_groups',{status:'d'},{group_id :req.body.group_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Item group  delete successful.`
        });
    }
})


router.post(`/api/delete-collection-group`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_collection_groups',{status:'d'},{group_id :req.body.group_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Collection group  delete successful.`
        });
    }
})

router.post(`/api/delete-item-category`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_categories',{status:'d'},{category_id :req.body.category_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Item Category  delete successful.`
        });
    }
})
router.post(`/api/delete-item`,async(req,res,next)=>{
    let payLoad = req.body

    let [saveErr,save] = await _p(db.update('tbl_items',{status:'d'},{item_id :req.body.item_id })).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{

        if(payLoad.photo != ''  &&  payLoad.photo != 'null' &&    payLoad.photo != null){

              fs.stat(`./uploads/${payLoad.photo}`, function (err, stats) {
                console.log(stats);//here we got all information of file in stats variable
             
                if (err) {
                    return console.error(err);
                }
             
                fs.unlink(`./uploads/${payLoad.photo}`,function(err){
                     if(err) return console.log(err);
                     console.log('file deleted successfully');
                });  
             });

        }


        res.json({
            error:false,
            msg:`Item   delete successful.`
        });
    }
})

router.post(`/api/save-item`,async(req,res,next)=>{



    uploadSingleItem(req, res, async function (err) { 
        let payLoad = req.body;

  
        if (err instanceof multer.MulterError) {

            res.json(err)
          // A Multer error occurred when uploading.
        } else if (err) {

            res.json(err)
          // An unknown error occurred when uploading.
        }
 
        payLoad.photo = payLoad.photo != '' &&  res.req.file.filename != undefined ? res.req.file.filename : ''
        if(payLoad.photo == '' && payLoad.action=='update'){
            delete payLoad.photo
        }else{
            
        }

        if(payLoad.photo != '' && payLoad.action=='update' && payLoad.prev_photo != '' 
        &&   payLoad.prev_photo != 'null' &&    payLoad.prev_photo != null){

              fs.stat(`./uploads/${payLoad.prev_photo}`, function (err, stats) {
                console.log(stats);//here we got all information of file in stats variable
             
                if (err) {
                    return console.error(err);
                }
             
                fs.unlink(`./uploads/${payLoad.prev_photo}`,function(err){
                     if(err) return console.log(err);
                     console.log('file deleted successfully');
                });  
             });

        }

        // End photo upload

        payLoad.create_by = req.user.user_id;
        payLoad.branch_ids = req.user.user_branch_id;


        let transaction; 

        try{
            transaction = await Tran.sequelize.transaction();

            if(payLoad.action == 'create'){
                let exist =  await  Tran.countRows(`select item_name from tbl_items where item_name=?  and status= 'a' `,[payLoad.item_name],transaction)
        
                if(exist > 0 ){
                    res.json({
                        error:true,
                        msg:`Item Name Already Exist.`
                    });
                    return false
                }
        
         
        
                delete payLoad.action;
                delete payLoad.item_id;
                delete payLoad.prev_photo;
                let [save, _]  = await Tran.create(`tbl_items`,payLoad,transaction)

                await stockUpdate('opening_qty','plus',save,payLoad.opening_qty,req.user.user_branch_id,0,transaction)

                await itemCostUpdate('plus',save,payLoad.opening_qty,payLoad.opening_rate,0,req.user.user_branch_id,0,transaction)

                if(_ && !save){
                    next(saveErr)
                }else{
                  
                 // end
        
                    res.json({
                        error:false,
                        msg:`Item Name create successful.`
                    });
                }
        
            }else{
               let exist =  await  Tran.countRows(`select item_name from tbl_items where item_name=? and item_id != ? and status= 'a' `,[payLoad.item_name,payLoad.item_id],transaction)
        
                if(exist > 0 ){
                    res.json({
                        error:true,
                        msg:`Item  Name Already Exist.`
                    });
                    return false
                }
        
                let item_id = payLoad.item_id;
                delete payLoad.action;
                delete payLoad.item_id;
                delete payLoad.branch_ids; 
                delete payLoad.prev_photo;

                let beforeStock =  await  getStock(req,res,next,item_id,'',req.user.user_branch_id,0,transaction);
                beforeStock = beforeStock[0].current_qty


                let prevItemData = await Tran.selectByCond(` select * from tbl_items   where item_id=? and status = 'a' `,[item_id], transaction)
                // previous Minus

                await stockUpdate('opening_qty','minus',item_id,prevItemData[0].opening_qty,req.user.user_branch_id,0,transaction)
                await itemCostUpdate('minus',item_id,prevItemData[0].opening_qty,prevItemData[0].opening_rate,beforeStock,req.user.user_branch_id,0,transaction)
                
                // Current  Plus
                beforeStock =  await  getStock(req,res,next,item_id,'',req.user.user_branch_id,0,transaction);
                beforeStock = beforeStock[0].current_qty

               
                await stockUpdate('opening_qty','plus',item_id,payLoad.opening_qty,req.user.user_branch_id,0,transaction)
                await itemCostUpdate('plus',item_id,payLoad.opening_qty,payLoad.opening_rate,beforeStock,req.user.user_branch_id,0,transaction)


                 await Tran.update('tbl_items',payLoad,{item_id},transaction)
             
                    res.json({
                        error:false,
                        msg:`Item  update successful.`
                    });
                
            }

            await transaction.commit();


        } catch (err) {
        await transaction.rollback();
        next(err);
       }


})
    
});

 
router.post(`/api/save-account`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.create_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;

        payLoad.acc_type_id = payLoad.acc_type.acc_type_id;
        payLoad.acc_type_name = payLoad.acc_type.acc_type_name;
        payLoad.acc_type_label = payLoad.acc_type.label;
        delete payLoad.acc_type;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name=? and branch_id = ? and status ='a'  `,[payLoad.acc_name,req.user.user_branch_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Account Name Already Exists.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.acc_id;
        let [saveErr,save] = await _p(db.insert('tbl_accounts',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Account Created  Successfully.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name=? and branch_id = ? and acc_id !=?  and status ='a'   `,[payLoad.acc_name,req.user.user_branch_id,payLoad.acc_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Account Name Already Exists.`
            });
            return false
        }

        let acc_id = payLoad.acc_id;
        delete payLoad.action;
        delete payLoad.acc_id;
        let [saveErr,save] = await _p(db.update('tbl_accounts',payLoad,{acc_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Account Name  updated successfully.`
            });
        }
    }
    
});


router.post(`/api/save-expense`,async(req,res,next)=>{
    let transaction; 
        try{
            transaction = await Tran.sequelize.transaction();

            let expense = req.body.expense;
            let expenseDetail = req.body.expenseDetail
                expense.creation_by = req.user.user_id;
                expense.branch_id = req.user.user_branch_id;

    if(expense.action == 'create'){
        let exist = await Tran.countRows(`select exp_code from tbl_expenses where exp_code=?   and status= 'a' `,[expense.exp_code], transaction)
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Expense Code Already Exists.`
            });
            return false
        }
        delete expense.action;
        delete expense.exp_id;
        let [save, _]  = await Tran.create(`tbl_expenses`,expense,transaction)

            for(detail of expenseDetail){
                detail.exp_id = save
                detail.branch_id = req.user.user_branch_id;
                delete detail.acc_name
                await Tran.create(`tbl_expense_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Expense Created  Successfully.`
            });
    }else{
        let exist = await Tran.selectByCond(`select exp_code from tbl_expenses where exp_code=? and exp_id <> ?   and status= 'a' `,[expense.exp_code,expense.exp_id], transaction)

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Expense Code Already Exists.`
            });
            return false
        }
        let exp_id = expense.exp_id;
        delete expense.action;
        delete expense.exp_id;

        await Tran.update(`tbl_expenses`,expense,{exp_id},transaction)

        await Tran.delete(`tbl_expense_details`,{exp_id},transaction)
  
            for(detail of expenseDetail){
                detail.exp_id = exp_id
                detail.branch_id = req.user.user_branch_id;
                delete detail.acc_name
                delete detail.exp_d_id 
                delete detail.acc_id 
                await Tran.create(`tbl_expense_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Expense  updated successfully.`
            });
        
    }
    }
    catch (err) {
        await transaction.rollback();
        next(err);
       }
    
});

router.post(`/api/delete-recognition`,async(req,res,next)=>{

    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    await Tran.update(`tbl_expense_recognition`,{status:'d'},{recog_id:req.body.recog_id},transaction)
    await Tran.update(`tbl_expense_recognition_details`,{status:'d'},{recog_id:req.body.recog_id},transaction)

    await transaction.commit();
    res.json({
        error:false,
        msg:`Expense recognition deleted successfully.`
    });
}
catch (err) {
    await transaction.rollback();
    next(err);
   }

})

router.post(`/api/delete-expense`,async(req,res,next)=>{
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    await Tran.update(`tbl_expenses`,{status:'d'},{exp_id:req.body.exp_id},transaction)
    await Tran.update(`tbl_expense_details`,{status:'d'},{exp_id:req.body.exp_id},transaction)

    await transaction.commit();
    res.json({
        error:false,
        msg:`Expense deleted successfully.`
    });
}
catch (err) {
    await transaction.rollback();
    next(err);
   }
})

router.post(`/api/delete-income`,async(req,res,next)=>{

    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
    
        await Tran.update(`tbl_incomes`,{status:'d'},{inc_id:req.body.inc_id},transaction)
        await Tran.update(`tbl_income_details`,{status:'d'},{inc_id:req.body.inc_id},transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Income deleted successfully.`
        });
    }
    catch (err) {
            await transaction.rollback();
            next(err);
    }
})

router.post(`/api/save-income`,async(req,res,next)=>{
   
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let income = req.body.income;
    let incomeDetail = req.body.incomeDetail
        income.creation_by = req.user.user_id;
        income.branch_id = req.user.user_branch_id;

    if(income.action == 'create'){
        let exist = await Tran.selectByCond(`select inc_code from tbl_incomes where inc_code=?   and status= 'a'  `,[income.inc_code], transaction)
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Income Code Already Exists.`
            });
            return false
        }

        delete income.action;
        delete income.inc_id;
        let [save, _]  = await Tran.create(`tbl_incomes`,income,transaction)

            for(detail of incomeDetail){
                detail.inc_id = save
                detail.branch_id = req.user.user_branch_id;
                delete detail.acc_name

                await Tran.create(`tbl_income_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Income Created  Successfully.`
            });
    }else{
        let exist = await Tran.selectByCond(` select inc_code from tbl_incomes where inc_code=? and inc_id <> ?   and status= 'a' `,[income.inc_code,income.inc_id], transaction)

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Income Code Already Exists.`
            });
            return false
        }
        let inc_id = income.inc_id;
        delete income.action;
        delete income.inc_id;

        await Tran.update(`tbl_incomes`,income,{inc_id},transaction)
    
        await Tran.delete(`tbl_income_details`,{inc_id},transaction)

            for(detail of incomeDetail){
                detail.inc_id = inc_id
                detail.branch_id = req.user.user_branch_id;
                delete detail.acc_name
                delete detail.inc_d_id 
                delete detail.acc_id 
                await Tran.create(`tbl_income_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Income  updated successfully.`
            });
    }

}
catch (err) {
        await transaction.rollback();
        next(err);
       }

    
});


router.post(`/api/save-recognition`,async(req,res,next)=>{
 
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let recognition = req.body.recognition;
    let recognitionDetail = req.body.recognitionDetail
    recognition.creation_by = req.user.user_id;
    recognition.branch_id = req.user.user_branch_id;
    recognition.status = 'p';

    if(recognition.action == 'create'){
        delete recognition.action;
        delete recognition.recog_id;
        let [save, _]  = await Tran.create(`tbl_expense_recognition`,recognition,transaction)
     
            for(detail of recognitionDetail){
            detail.recog_id = save
            detail.status = 'p';
            await Tran.create(`tbl_expense_recognition_details`,detail,transaction)
            }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Recognition  Created  Successfully.`
            });
    }else{
   
        let recog_id = recognition.recog_id;
        delete recognition.action;
        delete recognition.recog_id;
        delete recognition.status;

        await Tran.update(`tbl_expense_recognition`,recognition,{recog_id},transaction)

        await Tran.delete(`tbl_expense_recognition_details`,{recog_id},transaction)

            for(detail of recognitionDetail){
                detail.recog_id = recog_id
                delete detail.recog_d_id 
                await Tran.create(`tbl_expense_recognition_details`,detail,transaction)
             }

        await transaction.commit();
        res.json({
            error:false,
            msg:`Recognition   updated successfully.`
        });
    }
}
catch (err) {
        await transaction.rollback();
        next(err);
}
});


router.post(`/api/save-contra`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.creation_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select contra_code from tbl_contra_trans
         where contra_code=?  and status= 'a' `,[payLoad.contra_code])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Contra code Already Exists.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.contra_id;
        let [saveErr,save] = await _p(db.insert('tbl_contra_trans',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Contra created successfully.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select contra_code from tbl_contra_trans 
        where contra_code=? and contra_id  != ? and status= 'a' `,[payLoad.contra_code,payLoad.contra_id ])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Contra Already Exists.`
            });
            return false
        }

        let contra_id  = payLoad.contra_id;
        delete payLoad.action;
        delete payLoad.contra_id ;
        let [saveErr,save] = await _p(db.update('tbl_contra_trans',payLoad,{contra_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Contra  updated successfully.`
            });
        }
    }
    
});


router.post(`/api/save-advance-tran`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.created_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
    if(payLoad.action == 'create'){
       

        delete payLoad.action;
        delete payLoad.tran_id;
        let [saveErr,save] = await _p(db.insert('tbl_advance_transactions',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Advance transaction created successfully.`
            });
        }

    }else{
    

        let tran_id  = payLoad.tran_id;
        delete payLoad.action;
        delete payLoad.tran_id;
        let [saveErr,save] = await _p(db.update('tbl_advance_transactions',payLoad,{tran_id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Advance transaction  updated successfully.`
            });
        }
    }
    
});

router.post(`/api/save-branch-tran`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        let payLoad = req.body;
        payLoad.creation_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
        payLoad.from_branch_id = req.user.user_branch_id;
        if(payLoad.action == 'create'){
        let exist = await Tran.countRows(`select tran_code from tbl_branch_transactions where tran_code = ?`,[payLoad.tran_code], transaction)
    
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Transaction code Already Exists.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.tran_id;
        
        await Tran.create(`tbl_branch_transactions`,payLoad,transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Branch Transaction created successfully.`
        });
        

    }else{
        let exist = await Tran.selectByCond(` select tran_code from tbl_branch_transactions 
        where tran_code=? and tran_id  != ? `,[payLoad.tran_code,payLoad.tran_id ], transaction)
        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Contra Already Exists.`
            });
            return false
        }

        let tran_id  = payLoad.tran_id;
        delete payLoad.action;
        delete payLoad.tran_id;

        await Tran.update(`tbl_branch_transactions`,payLoad,{tran_id},transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Branch Transaction  updated successfully.`
        });
    }
    }catch (err) {
        await transaction.rollback();
        next(err);
    }
});


router.post(`/api/get-conversations`,async(req,res,next)=>{
    let cluases = ``

   if(req.body.customer_id != undefined && req.body.customer_id != null &&  req.body.customer_id  > 0){


    var [conversationsErr,conversations] =  await _p(db.query(`select 
     conversation,
     creation_date as created_date
     from tbl_accounts 
     where acc_id  = ${req.body.customer_id}

  

     union select

     text as conversation,
     created_date

     from tbl_conversations 
     where customer_id  = ${req.body.customer_id}


     order by created_date desc


     `).then(res=>{
        return res;
    }));


   }else{
    var conversations = []
   }
    


    res.json( await  Promise.all(conversations));

});


router.post(`/api/get-collection-groups`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.componentName != undefined && req.body.componentName != null ){
        cluases += ` and  gp.component_name = '${req.body.componentName}' `
    }


    let [groupsErr,groups] =  await _p(db.query(`select 
     gp.*,emp.employee_name,acc.acc_name
     from tbl_collection_groups gp 
     left join tbl_employees emp on emp.employee_id = gp.employee_id
     left join tbl_accounts acc on acc.acc_id = gp.acc_id
     where gp.status  = 'a'
     and gp.branch_id = ${req.user.user_branch_id}
     ${cluases}
     order by gp.group_id desc
     `).then(res=>{
        return res;
    }));
    
    groups = groups.map(async(gp)=>{

        employee_ids = gp.employee_ids.split(',')

        gp.employees =  employee_ids.map(async(emp)=>{


            let [employeeErr,employee] =  await _p(db.query(`select emp.employee_name,emp.employee_id
             from tbl_employees  emp
             where emp.employee_id = ? 
             `,[emp]).then(res=>{
                return res;
            }));
        
            return  employee.length != 0 ? employee[0] : null
        });

        gp.employees = await Promise.all(gp.employees)
        
     return gp


    })

    res.json( await Promise.all(groups));

});

router.post(`/api/get-contras`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(con.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  con.creation_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }


    let [contrasErr,contras] =  await _p(db.query(`select con.*,u.user_name,u.user_full_name,
    acc.acc_name as from_acc_name,acca.acc_name as to_acc_name
     from tbl_contra_trans con
     left join tbl_accounts acc on acc.acc_id  = con.from_acc_id
     left join tbl_accounts acca on acca.acc_id  = con.to_acc_id
     left join tbl_users u on u.user_id = con.creation_by
     where con.branch_id = ? 
     and con.status = 'a' 
     ${cluases}
     order by contra_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));


    

    res.json( await  Promise.all(contras));

});

router.post(`/api/get-advance-trans`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(at.tran_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  at.tran_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }

    if(req.body.accId != undefined && req.body.accId != null){
        cluases += ` and  at.acc_id =  '${req.body.accId}' `
    }

    if(req.body.tran_type != undefined && req.body.tran_type != null){
        cluases += ` and  at.tran_type =  '${req.body.tran_type}' `
    }

    if(req.body.acc_type != undefined && req.body.acc_type != null){
        cluases += ` and  at.acc_type =  '${req.body.acc_type}' `
    }



    let [contrasErr,contras] =  await _p(db.query(`select at.*,u.user_name,u.user_full_name,
    acc.acc_name as tran_acc_name,acca.acc_name as acc_name
     from tbl_advance_transactions  at
     left join tbl_accounts acc on acc.acc_id  = at.tran_acc_id
     left join tbl_accounts acca on acca.acc_id  = at.acc_id
     left join tbl_users u on u.user_id = at.created_by
     where at.branch_id = ? 
     and at.tran_status = 'a' 
     ${cluases}
     order by at.tran_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));



    res.json( await  Promise.all(contras));

});

router.post(`/api/get-branch-trans`,async(req,res,next)=>{
    let cluases = ``

    // if(req.body.oneDate != undefined && req.body.oneDate != null){
    //     cluases += ` and  DATE(bt.tran_date) = '${isoFromDate(req.body.oneDate)}' `
    // }

    
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  bt.tran_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }


    let [transErr,trans] =  await _p(db.query(`select bt.*,u.user_name,u.user_full_name,b.branch_name,
     acc.acc_name as from_acc_name,acca.acc_name as to_acc_name
     from tbl_branch_transactions bt
     left join tbl_accounts acc on acc.acc_id  = bt.from_acc_id
     left join tbl_accounts acca on acca.acc_id  = bt.to_acc_id
     left join tbl_branches b on b.branch_id  = bt.to_branch_id
     left join tbl_users u on u.user_id = bt.creation_by
     where bt.branch_id = ? 
     and bt.status != 'd' 
     ${cluases}
     order by tran_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    

    res.json(trans);

});


  
router.post(`/api/get-branch-trans-pending-list`,async(req,res,next)=>{
    let cluases = ``

    // if(req.body.oneDate != undefined && req.body.oneDate != null){
    //     cluases += ` and  DATE(bt.tran_date) = '${isoFromDate(req.body.oneDate)}' `
    // }

    
    // if(req.body.fromDate != undefined && req.body.toDate != null){
    //     cluases += ` and  bt.tran_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    // }


      if(req.body.fromBranchId != undefined && req.body.fromBranchId != null){
        cluases += ` and  bt.from_branch_id = ${req.body.fromBranchId}  `
    }


    let [transErr,trans] =  await _p(db.query(`select bt.*,u.user_name,u.user_full_name,b.branch_name,
     acc.acc_name as from_acc_name,acca.acc_name as to_acc_name
     from tbl_branch_transactions bt
     left join tbl_accounts acc on acc.acc_id  = bt.from_acc_id
     left join tbl_accounts acca on acca.acc_id  = bt.to_acc_id
     left join tbl_branches b on b.branch_id  = bt.from_branch_id
     left join tbl_users u on u.user_id = bt.creation_by
     where bt.to_branch_id = ? 
     and bt.status != 'd' 
     and bt.status != 'a' 
     ${cluases}
     order by tran_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    

    res.json(trans);

});


router.post(`/api/get-branch-trans-receive-list`,async(req,res,next)=>{
    let cluases = ``

    // if(req.body.oneDate != undefined && req.body.oneDate != null){
    //     cluases += ` and  DATE(bt.tran_date) = '${isoFromDate(req.body.oneDate)}' `
    // }

    
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  bt.tran_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }


      if(req.body.fromBranchId != undefined && req.body.fromBranchId != null){
        cluases += ` and  bt.from_branch_id = ${req.body.fromBranchId}  `
    }


    let [transErr,trans] =  await _p(db.query(`select bt.*,u.user_name,u.user_full_name,b.branch_name,
     acc.acc_name as from_acc_name,acca.acc_name as to_acc_name
     from tbl_branch_transactions bt
     left join tbl_accounts acc on acc.acc_id  = bt.from_acc_id
     left join tbl_accounts acca on acca.acc_id  = bt.to_acc_id
     left join tbl_branches b on b.branch_id  = bt.from_branch_id
     left join tbl_users u on u.user_id = bt.creation_by
     where bt.to_branch_id = ? 
     and bt.status != 'd' 
     and bt.status = 'a' 
     ${cluases}
     order by tran_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    

    res.json(trans);

});


router.post(`/api/get-branch-trans-transfer-list`,async(req,res,next)=>{
    let cluases = ``

    // if(req.body.oneDate != undefined && req.body.oneDate != null){
    //     cluases += ` and  DATE(bt.tran_date) = '${isoFromDate(req.body.oneDate)}' `
    // }

    
    if(req.body.fromDate != undefined && req.body.toDate != null){
        cluases += ` and  bt.tran_date between  '${req.body.fromDate}' and  '${req.body.toDate}'`
    }


      if(req.body.fromBranchId != undefined && req.body.fromBranchId != null){
        cluases += ` and  bt.to_branch_id = ${req.body.fromBranchId}  `
    }


    let [transErr,trans] =  await _p(db.query(`select bt.*,u.user_name,u.user_full_name,b.branch_name,
     acc.acc_name as from_acc_name,acca.acc_name as to_acc_name
     from tbl_branch_transactions bt
     left join tbl_accounts acc on acc.acc_id  = bt.from_acc_id
     left join tbl_accounts acca on acca.acc_id  = bt.to_acc_id
     left join tbl_branches b on b.branch_id  = bt.to_branch_id
     left join tbl_users u on u.user_id = bt.creation_by
     where bt.branch_id = ? 
     and bt.status != 'd' 
     and bt.status = 'a' 
     ${cluases}
     order by tran_id desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    

    res.json(trans);

});

router.post(`/api/get-access`,async(req,res,next)=>{
    let [accessErr,access] = await _p(db.query(`select user_access,user_full_name from tbl_users where user_id=?`,[req.body.userId]).then(res=>{
      return res;
    }));
     if(accessErr && !access){ return next(accessErr)}
    res.json(access[0]);
});



router.post(`/public/app-checker`,async (req,res,next)=>{
    let [checkingErr,checking] =  await _p(db.countRows(`select * from tbl_checking where 
    status='a' and  app_id=? `,[req.body.appId])).then(row=>{
        return row;
    });
    res.json({
        error:false,
        active: checking > 0 ? 'YES':'NO'
    })
})

router.post(`/api/sent-sms`,async(req,res,next)=>{
    req.body.persons.map(async(person)=>{

        // if(person.mobile_no.trim() != ''){
        //     await axios.post(`https://mshastra.com/sendsms_api_json.aspx`,[{
        //         "user":"myfone",
        //         "pwd":"hpb_jy99",
        //         "number":"88"+person.mobile_no,
        //         "msg":req.body.msg,
        //         "sender":"8809617642241",
        //         "language":"Unicode/English"
        //     }]).then(res=>{
        //         console.log(res.data)
        //     })
        // }

    })

    res.json(req.body.persons);

})



router.get(`/backup`,async(req,res,next)=>{
    const backupFileName = isoToDate(getCurrentISODT())+'-backup.sql';    
    let config = dbConfig.config
    delete config.dialect 

    await mysqldump({
        connection: config,
        dumpToFile: backupFileName,
      });
  
      const backupFilePath = path.join(path.resolve(), backupFileName);
  
      res.download(backupFilePath, backupFileName, (err) => {
        console.log(err)
        if (err) {
          console.error(`Download error: ${err.message}`);
          res.status(500).send('done');
        } else {
          // Delete the backup file after download
          fs.unlink(backupFilePath, (deleteErr) => {
            if (deleteErr) {
              console.error(`Error deleting backup file: ${deleteErr.message}`);
            }
          });
        }
      });

})

module.exports = router;