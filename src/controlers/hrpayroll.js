const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const { exit } = require('process');
const  {Transaction}   = require('../utils/TranDB');

let    db = new Database();
let    Tran = new Transaction();


let getEmployeeCode = async (req,res,next)=>{
    let [employeeCodeError,employeeCode] =  await _p(db.query(`select employee_id   from tbl_employees
      order by employee_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(employeeCodeError){
        next(employeeCodeError)
    }
    if(employeeCode.length == 0){
        employeeCode = 'EM1';
    }else{
        employeeCode = 'EM'+(parseFloat(employeeCode[0].employee_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(employeeCode)
    })
}



let getEmployeePayCode = async (req,res,next)=>{
    let [employeePayCodeError,employeePayCode] =  await _p(db.query(`select pay_id   from tbl_employee_pays
    
      order by pay_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(employeePayCodeError){
        next(employeePayCodeError)
    }
    if(employeePayCode.length == 0){
        employeePayCode = 'EPAY1';
    }else{
        employeePayCode = 'EPAY'+(parseFloat(employeePayCode[0].pay_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(employeePayCode)
    })
}

router.post('/api/get-employee-code',async(req,res,next)=>{  
    res.json(await  getEmployeeCode(req,res,next));
});

router.post('/api/get-payment-code',async(req,res,next)=>{  
    res.json(await  getEmployeePayCode(req,res,next));
});


router.post(`/api/get-departments`,async(req,res,next)=>{

   let [errdepartments,departments] =  await _p(db.query(`select *   
        from tbl_departments 
        where status = 'a' 
        and branch_id = ${req.user.user_branch_id}
        order by id   desc `)).then(result=>{
        return result;
    });

    res.json(departments)
})

router.post(`/api/get-designations`,async(req,res,next)=>{
    let [errdesignations,designations] =  await _p(db.query(`select *   
        from tbl_designations
        where status = 'a' 
        and branch_id = ${req.user.user_branch_id}
        order by id   desc `)).then(result=>{
        return result;
    });
    res.json(designations)
})


router.post(`/api/save-employee`,async(req,res,next)=>{
    let payLoad = req.body;

    if(payLoad.action == 'create'){

        let [employeeError,employee] =  await _p(db.countRows(`select *   from tbl_employees
        where employee_name = ? and branch_id = ? and status = 'a' `,[payLoad.employee_name,req.user.user_branch_id])).then(result=>{
            return result;
        });

        if(employee > 0 ){
            res.json({error:true,message:'Employee name already Exist.'});
            return false
        }


        delete payLoad.employee_id;
        delete payLoad.action;
        payLoad.employee_code = await getEmployeeCode()
        payLoad.created_by = req.user.user_id;
        payLoad.branch_id  = req.user.user_branch_id

        let [entryErr,entry] =  await _p(db.insert('tbl_employees',payLoad)).then((row)=>{
            return row;
        });

        if(entry){
            res.json({error:false,message:'Employee created Successfully.'});
        }
    }


    if(payLoad.action == 'update'){

        let [employeeError,employee] =  await _p(db.countRows(`select *   from tbl_employees
        where employee_name = ? and branch_id = ? and status = 'a' and employee_id <> ? `,[payLoad.employee_name,req.user.user_branch_id,payLoad.employee_id])).then(result=>{
            return result;
        });

        if(employee > 0 ){
            res.json({error:true,message:'Employee name already Exist.'});
            return false
        }


        let cond = {
            employee_id : payLoad.employee_id
        }
        delete payLoad.employee_id;
        delete payLoad.employee_code;
        delete payLoad.action;

    
      
        let [entryErr,entry] =  await _p(db.update('tbl_employees',payLoad,cond)).then((row)=>{
            return row;
        });

        if(entry){
            res.json({error:false,message:'Employee updated Successfully.'});
        }
    }


});

router.post(`/api/get-employees`,async(req,res,next)=>{
    let [employeesErr,employees] =  await _p(db.query(`select emp.*,d.name as department_name,ds.name as designation_name,concat(emp.employee_name,' - ',emp.employee_code) as display_text
        from tbl_employees emp
        left join tbl_departments d on d.id = emp.department_id
        left join tbl_designations ds on ds.id = emp.designation_id
        where emp.status = 'a' 
        and emp.branch_id = ${req.user.user_branch_id}
        order by emp.employee_id   desc `)).then(result=>{
        return result;
    });
    res.json(employees)
})

router.post(`/api/delete-employee`,async(req,res,next)=>{
    
    let [saveErr,save] = await _p(db.update('tbl_employees',{status:'d'},{employee_id:req.body.employee_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Employee deleted successfull.`
        });
    }
});



router.post(`/api/save-department`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.name = payLoad.department_name;
        payLoad.created_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
        delete payLoad.department_name
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select name from tbl_departments
         where  name=? and branch_id = ? and status= 'a' `,[payLoad.name,req.user.user_branch_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Department Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.department_id;
        let [saveErr,save] = await _p(db.insert('tbl_departments',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Department created successfully.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select name from tbl_departments
        where  name=? and branch_id = ? and status= 'a' and id <> ? `,[payLoad.name,req.user.user_branch_id,payLoad.department_id])).then(res=>{
           return res;
       });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Department Name Already Exist.`
            });
            return false
        }

        let id = payLoad.department_id;
        delete payLoad.action;
        delete payLoad.department_id;
        let [saveErr,save] = await _p(db.update('tbl_departments',payLoad,{id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Department updated successfully.`
            });
        }
    }
    
});

router.post(`/api/save-designation`,async(req,res,next)=>{
    let payLoad = req.body;
        payLoad.name = payLoad.designation_name;
        payLoad.created_by = req.user.user_id;
        payLoad.branch_id = req.user.user_branch_id;
        delete payLoad.designation_name
    if(payLoad.action == 'create'){
        let [existErr,exist] =  await _p(db.countRows(`select name from tbl_designations
         where  name=? and branch_id = ? and status= 'a' `,[payLoad.name,req.user.user_branch_id])).then(res=>{
            return res;
        });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Designation Name Already Exist.`
            });
            return false
        }

        delete payLoad.action;
        delete payLoad.designation_id;
        let [saveErr,save] = await _p(db.insert('tbl_designations',payLoad)).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Designation created successfully.`
            });
        }

    }else{
        let [existErr,exist] =  await _p(db.countRows(`select name from tbl_designations
        where  name=? and branch_id = ? and status= 'a' and id <> ? `,[payLoad.name,req.user.user_branch_id,payLoad.designation_id])).then(res=>{
           return res;
       });

        if(exist > 0 ){
            res.json({
                error:true,
                msg:`Designation Name Already Exist.`
            });
            return false
        }

        let id = payLoad.designation_id;
        delete payLoad.action;
        delete payLoad.designation_id;
        let [saveErr,save] = await _p(db.update('tbl_designations',payLoad,{id})).then(res=>{
            return res;
        });
        if(saveErr && !save){
            next(saveErr)
        }else{
            res.json({
                error:false,
                msg:`Designation updated successfully.`
            });
        }
    }
    
});

router.post(`/api/delete-department`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_departments',{status:'d'},{id:req.body.department_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Department deleted successfully.`
        });
    }
})

router.post(`/api/delete-designation`,async(req,res,next)=>{
    let [saveErr,save] = await _p(db.update('tbl_designations',{status:'d'},{id:req.body.designation_id})).then(res=>{
        return res;
    });
    if(saveErr && !save){
        next(saveErr)
    }else{
        res.json({
            error:false,
            msg:`Designation deleted successfully.`
        });
    }
});




router.post(`/api/get-employees-by-search`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.query != undefined && req.body.query != null){
        if(req.body.query == ''){
            cluases +=  ` and 0=1`
        }else{
            cluases += ` and  emp.employee_name like  '%${req.body.query}%'  `
        }
    }

  
    
    let [employeesErr,employees] =  await _p(db.query(`select concat(emp.employee_name) as display_text,emp.employee_name,emp.employee_id
     from tbl_employees emp
     where 
     emp.status = "a" 
     and emp.branch_id = ?
     ${cluases}
     order by emp.employee_name  asc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }))

    if(employeesErr && !employees) return next(employeesErr);
    res.json(employees);

});


router.post(`/api/save-employee-payment`,async(req,res,next)=>{
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let payment = req.body.payment;
    let paymentDetail = req.body.paymentDetail
        payment.creation_by = req.user.user_id;
        payment.branch_id = req.user.user_branch_id;

    if(payment.action == 'create'){
        delete payment.action;
        delete payment.pay_id;
        let [save, _]  = await Tran.create(`tbl_employee_pays`,payment,transaction)

            for(detail of paymentDetail){
                detail.pay_id = save
                detail.status =  payment.status
                delete detail.acc_name
                await Tran.create(`tbl_employee_pay_details`,detail,transaction)
             }

            await transaction.commit();
            res.json({
                error:false,
                msg:`Payment Created  Successfully.`
            });
    }else{
     
        let pay_id = payment.pay_id;
        delete payment.action;
        delete payment.status;
        delete payment.pay_id;

        await Tran.update(`tbl_employee_pays`,payment,{pay_id},transaction)
        await Tran.delete(`tbl_employee_pay_details`,{pay_id},transaction)

            for(detail of paymentDetail){
                detail.pay_id = pay_id
                delete detail.acc_name
                delete detail.pay_d_id 
                delete detail.acc_id 
                await Tran.create(`tbl_employee_pay_details`,detail,transaction)
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


router.post(`/api/get-salary-payment-record`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(epay.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    if(req.body.typeId != undefined || req.body.typeId == null){
        cluases += ` and  epay.from_acc_id != 0 `
    }

    if(req.body.fromDate != undefined && req.body.toDate != undefined){
        cluases +=  ` and epay.creation_date between "${req.body.fromDate}" and "${req.body.toDate}" `
    }


    let [paysErr,pays] =  await _p(db.query(`select epay.*,acc.acc_name,u.user_full_name,
    accid.acc_name as salary_acc_name
     from tbl_employee_pays epay 
     left join tbl_accounts accid on accid.acc_id = epay.salary_acc_id 
     left join tbl_accounts acc on acc.acc_id = epay.from_acc_id 
     left join tbl_users u on u.user_id = epay.creation_by 
     where epay.status = "a" 
     and epay.branch_id = ?
     ${cluases}
     order by epay.pay_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    
  res.json(pays);


});

router.post(`/api/get-salary-report-details`,async(req,res,next)=>{
  
    let cluases = ` `


    if( req.body.employeeId != null){
        cluases += ` and  epd.to_acc_id = '${req.body.employeeId}' `
    }

    if( req.body.typeId != null){
        cluases += ` and  epd.pay_type = '${req.body.typeId}' `
    }
    
    if(req.body.typeId == null){
        cluases += ` and  epd.pay_type != 'Deduction' and  epd.pay_type != 'conveyance' and  epd.pay_type != 'Meal Expense' `
    }

    if(req.body.fromDate != undefined && req.body.toDate != undefined){
        cluases +=  ` and epay.creation_date between "${req.body.fromDate}" and "${req.body.toDate}" `
    }


   
   
        let [detailsErr,details] =  await _p(db.query(`select epd.*,epay.pay_code,epay.month,epay.creation_date,epay.year,emp.employee_name,emp.employee_id,acc.acc_name,u.user_full_name
              from tbl_employee_pay_details epd
              left join tbl_employee_pays epay on epay.pay_id = epd.pay_id
              left join tbl_employees emp on emp.employee_id = epd.to_acc_id
              left join tbl_accounts acc on acc.acc_id = epay.from_acc_id 
              left join tbl_users u on u.user_id = epay.creation_by

              where  epd.status = 'a' 
              and epay.branch_id = ?
              ${cluases}
              `,[req.user.user_branch_id]).then(res=>{
                  return res;
              }));


  res.json(details);


});

router.post(`/api/get-salary-payment-with-details`,async(req,res,next)=>{

    let cluases = ` `

    if(req.body.oneDate != undefined && req.body.oneDate != null){
        cluases += ` and  DATE(epay.creation_date) = '${isoFromDate(req.body.oneDate)}' `
    }

    if(req.body.page == undefined && req.body.page == null ){
        if(req.body.typeId != undefined || req.body.typeId == null){
            cluases += ` and  epay.from_acc_id != 0 `
        }
    }
    

    if(req.body.fromDate != undefined && req.body.toDate != undefined){
        cluases +=  ` and epay.creation_date between "${req.body.fromDate}" and "${req.body.toDate}" `
    }



    let [paysErr,pays] =  await _p(db.query(`select epay.*,acc.acc_name,u.user_full_name,
    accid.acc_name as salary_acc_name
     from tbl_employee_pays epay 
     left join tbl_accounts accid on accid.acc_id = epay.salary_acc_id 
     left join tbl_accounts acc on acc.acc_id = epay.from_acc_id 
     left join tbl_users u on u.user_id = epay.creation_by 
     where epay.status != "d" 
     and epay.branch_id = ?
     ${cluases}
     order by epay.pay_id  desc
     `,[req.user.user_branch_id]).then(res=>{
        return res;
    }));

    
    pays = pays.map(async (pay)=>{
        let [detailsErr,details] =  await _p(db.query(`select epd.*,emp.employee_name as acc_name,emp.employee_id as acc_id
              from tbl_employee_pay_details epd
              left join tbl_employees emp on emp.employee_id = epd.to_acc_id
              where  epd.status != 'd' 
              and epd.pay_id = ?
              `,[pay.pay_id]).then(res=>{
                  return res;
              }));
              pay.details = details;
          return pay;
  });


  res.json( await  Promise.all(pays));


});

router.post(`/api/approve-salary-payment`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        await Tran.update(`tbl_employee_pays`,{status:'a'},{pay_id :req.body.pay_id},transaction)
        await Tran.update(`tbl_employee_pay_details`,{status:'a'},{pay_id :req.body.pay_id},transaction)

        await transaction.commit();
        res.json({
            error:false,
            msg:`Employee Payment Approved Successfully.`
        });
    }catch (err) {
    await transaction.rollback();
    next(err);
   }
});



router.post(`/api/delete-salary-payment`,async(req,res,next)=>{

    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();
    
    await Tran.update(`tbl_employee_pays`,{status:'d'},{pay_id  :req.body.pay_id },transaction)
    await Tran.update(`tbl_employee_pay_details`,{status:'d'},{pay_id  :req.body.pay_id },transaction)

    await transaction.commit();
    res.json({
        error:false,
        msg:`Employee Payment Deleted Successfully.`
    });
}
catch (err) {
    await transaction.rollback();
    next(err);
   }

});


router.post(`/api/get-employee-payable-amount`,async(req,res,next)=>{
    let para = req.body;
    let cluases = ``
    if(para.employeeId != undefined && para.employeeId != null){
        cluases += ` and  emp.employee_id = ${para.employeeId} `
    }

    let month = para.month;

   
   let [month_day_err,month_day] =  await _p(db.query(`select month_day
              from tbl_emp_attendance_details 
              where  year = '${para.year}'
              ${month!=null ? `and month = '${para.month}' ` :''} 
              limit 1
              `).then(res=>{
                  return res;
              }));


           let getMonthDay   = month_day.length == 0 ? 0 : month_day[0].month_day;


   let [resultErr,result] = await _p(db.query(`
              select emp.*, emp.basic_salary  as salary,
              CASE
        WHEN STR_TO_DATE(CONCAT(emp.month, ' ', emp.year), '%M %Y') > STR_TO_DATE('${para.month} ${para.year}', '%M %Y') or emp.update_salary = 0
             
        THEN emp.basic_salary
        ELSE emp.update_salary
    END AS salary,


               ${getMonthDay} as getMonthDay,
               d.name as department_name,ds.name as designation_name ,
               (
                select ifnull(sum(sm.total_amount),0) as sold_amount
                from tbl_sales_master sm 
                where 
                 sm.status = 'a'
                and sm.employee_id = emp.employee_id
                and sm.created_date between '${para.fromDate}' and '${para.toDate}'
                 
                 
               ) as sold_amount,

               (
                select (sold_amount * emp.commission_per) / 100
               ) as sales_commission,
               (
                select ifnull(sum(payd.pay_amount),0) as basic_salary_paid
                from tbl_employee_pay_details payd
                left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                where 
                payd.status = 'a' 
                and payd.pay_type = 'Basic Salary'
                and payd.to_acc_id = emp.employee_id
                and pay.year = '${para.year}'
                ${month!=null ? `and pay.month = '${para.month}' ` :''} 

                ) as basic_salary_paid,
                (
                    select ifnull(sum(payd.pay_amount),0) as advance_salary 
                    from tbl_employee_pay_details payd
                    left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                    where 
                    payd.status = 'a' 
                    and payd.pay_type = 'Advance Salary'
                    and payd.to_acc_id = emp.employee_id
                    and pay.year = '${para.year}'
                    ${month!=null ? `and pay.month = '${para.month}' ` :''} 

                    ) as advance_salary,
                    (
                        select ifnull(sum(payd.pay_amount),0) as advance_salary 
                        from tbl_employee_pay_details payd
                        left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                        where 
                        payd.status = 'a' 
                        and payd.pay_type = 'Deduction'
                        and payd.to_acc_id = emp.employee_id
                        and pay.year = '${para.year}'
                        ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                        ) as deduction_salary,


                        (
                            select ifnull(sum(payd.pay_amount),0) as conveyance 
                            from tbl_employee_pay_details payd
                            left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                            where 
                            payd.status = 'a' 
                            and payd.pay_type = 'conveyance'
                            and payd.to_acc_id = emp.employee_id
                            and pay.year = '${para.year}'
                            ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                            ) as conveyance,

                            (
                                select ifnull(sum(payd.pay_amount),0) as conveyance 
                                from tbl_employee_pay_details payd
                                left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                where 
                                payd.status = 'a' 
                                and payd.pay_type = 'Bonus'
                                and payd.to_acc_id = emp.employee_id
                                and pay.year = '${para.year}'
                                ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                ) as bonus,

                                (
                                    select ifnull(sum(payd.pay_amount),0) as conveyance 
                                    from tbl_employee_pay_details payd
                                    left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                    where 
                                    payd.status = 'a' 
                                    and payd.pay_type = 'Overtime'
                                    and payd.to_acc_id = emp.employee_id
                                    and pay.year = '${para.year}'
                                    ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                    ) as overtime,

                                    (
                                        select ifnull(sum(payd.pay_amount),0) as conveyance 
                                        from tbl_employee_pay_details payd
                                        left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                        where 
                                        payd.status = 'a' 
                                        and payd.pay_type = 'Commission'
                                        and payd.to_acc_id = emp.employee_id
                                        and pay.year = '${para.year}'
                                        ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                        ) as commission,

                             

                            (
                                select ifnull(sum(payd.pay_amount),0) as meal_expense 
                                from tbl_employee_pay_details payd
                                left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                where 
                                payd.status = 'a' 
                                and payd.pay_type = 'MA'
                                and payd.to_acc_id = emp.employee_id
                                and pay.year = '${para.year}'
                                ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                ) as ma,

                                (
                                    select ifnull(sum(payd.pay_amount),0) as meal_expense 
                                    from tbl_employee_pay_details payd
                                    left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                    where 
                                    payd.status = 'a' 
                                    and payd.pay_type = 'TA'
                                    and payd.to_acc_id = emp.employee_id
                                    and pay.year = '${para.year}'
                                    ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                    ) as ta,

                                    (
                                        select ifnull(sum(payd.pay_amount),0) as meal_expense 
                                        from tbl_employee_pay_details payd
                                        left join tbl_employee_pays pay on pay.pay_id = payd.pay_id
                                        where 
                                        payd.status = 'a' 
                                        and payd.pay_type = 'DA'
                                        and payd.to_acc_id = emp.employee_id
                                        and pay.year = '${para.year}'
                                        ${month!=null ? `and pay.month = '${para.month}' ` :''} 
                                        ) as da,



                        (
                            select ifnull(( salary / ${getMonthDay} ),0)
                        ) as per_day_pay,

                        (
                            select ifnull(count(*),0) from tbl_emp_attendance_details
                            where  emp_id = emp.employee_id
                            and branch_id = ${req.user.user_branch_id}
                            and year = '${para.year}'
                            ${month!=null ? `and month = '${para.month}' ` :''} 

                            and attendance in ('precent')
                        ) as precent_days,

                        (
                            select ifnull(count(*),0) from tbl_emp_attendance_details
                            where  emp_id = emp.employee_id
                            and branch_id = ${req.user.user_branch_id}
                            and year = '${para.year}'
                            ${month!=null ? `and month = '${para.month}' ` :''} 
                            and attendance in ('leave_with_pay')
                        ) as leave_with_pay_days,

                        (
                            select ifnull(count(*),0) from tbl_emp_attendance_details
                            where  emp_id = emp.employee_id
                            and branch_id = ${req.user.user_branch_id}
                            and year = '${para.year}'
                            ${month!=null ? `and month = '${para.month}' ` :''} 
                            and attendance in ('leave_without_pay')
                        ) as leave_without_pay_days,


                        (
                            select ifnull(count(*),0) from tbl_emp_attendance_details
                            where  emp_id = emp.employee_id
                            and branch_id = ${req.user.user_branch_id}
                            and year = '${para.year}'
                            ${month!=null ? `and month = '${para.month}' ` :''} 
                            and attendance in ('precent','leave_with_pay')
                        ) as payable_days,

                        ( 
                            select   ifnull(salary,0)
                        ) as basic_payable_salary,

                        (
                            select (basic_salary_paid + advance_salary + conveyance + bonus + overtime + commission + sales_commission + ta + da + ma) 
                        ) as paid_amount,
                        (
                            select (basic_payable_salary + conveyance + bonus + overtime + commission + sales_commission + ta + da + ma) - (paid_amount + deduction_salary )
                        ) as payable_salary

               from tbl_employees emp 
               left join tbl_departments d on d.id = emp.department_id
               left join tbl_designations ds on ds.id = emp.designation_id
               where 
               emp.status = 'a'
               and emp.branch_id = ${req.user.user_branch_id}
               ${cluases}
             `).then(res=>{
        return res;
    }));

    // per_day_pay * payable_days


        res.json(result);
    
});


router.post(`/api/get-attendance-employees`,async(req,res,next)=>{
    let para = req.body



    let [employeesErr,employees] =  await _p(db.query(`select emp.*,empd.*,d.name as department_name,ds.name as designation_name  
        from tbl_employees emp
        left join tbl_emp_attendance_details empd on empd.emp_id = emp.employee_id 
             and   DATE(empd.attendance_date) = '${isoFromDate(req.body.attendanceDate)}' and empd.month = '${para.month}' 
             and empd.year = '${para.year}'
        left join tbl_departments d on d.id = emp.department_id
        left join tbl_designations ds on ds.id = emp.designation_id
        where emp.status = 'a' 
        and emp.branch_id = ${req.user.user_branch_id}
        group by emp.employee_id
        order by emp.employee_id   desc  `)).then(result=>{
        return result;
    });
    res.json(employees)
});

router.post(`/api/save-attendance`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        let para = req.body;

        let counting = await Tran.select(`select *
        from tbl_emp_attendance_details 
        where  branch_id = ${req.user.user_branch_id}
        and emp_id = ${para.employee_id} 
        and   DATE(attendance_date) = '${isoFromDate(para.attendance_date)}' and month = '${para.month}' 
             and year = '${para.year}' `, transaction)


        if(counting.length == 0){
            await Tran.create(`tbl_emp_attendance_details`,{
                emp_id : para.employee_id,
                attendance : para.action,
                year : para.year,
                month : para.month,
                month_day : para.month_day,
                attendance_date : para.attendance_date,
                branch_id : req.user.user_branch_id,
            },transaction)
        }else{
            await Tran.update(`tbl_emp_attendance_details`,{
                attendance:para.action,
            },{att_d_id : para.att_d_id },transaction)
        }

        await transaction.commit();
        res.json({
            message : `Successfully Done.. `
        })
    }catch (err) {
    await transaction.rollback();
    next(err);
   }
});

router.post(`/api/save-all-attendance`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        let para = req.body;
        let employees = await Tran.select(`select emp.*
        from tbl_employees emp
        where emp.status = 'a' 
        and emp.branch_id = ${req.user.user_branch_id}
        order by emp.employee_id   desc  `, transaction)

        for(employee of employees){
            let counting = await Tran.select(`select *
            from tbl_emp_attendance_details 
            where  branch_id = ${req.user.user_branch_id}
            and emp_id = ${employee.employee_id} 
            and   DATE(attendance_date) = '${isoFromDate(para.attendance_date)}' and month = '${para.month}' 
                 and year = '${para.year}' `, transaction)
     
            if(counting.length == 0){
                await Tran.create(`tbl_emp_attendance_details`,{
                    emp_id : employee.employee_id,
                    attendance : para.action,
                    year : para.year,
                    month : para.month,
                    month_day : para.month_day,
                    attendance_date : para.attendance_date,
                    branch_id : req.user.user_branch_id,
                },transaction)
              }else{
                await Tran.updateQuery(`
                update tbl_emp_attendance_details
                set attendance = '${para.action}'
                where emp_id = ?
                and year = ?
                and month = ?
                and month_day = ?
                and    attendance_date like '%${isoFromDate(para.attendance_date)}%'
                `,[employee.employee_id,para.year,para.month,para.month_day],transaction)

              }
    
        }

        await transaction.commit();
        res.json({
            message : `Successfully Done.. `
        })
    }catch (err) {
    await transaction.rollback();
    next(err);
    }
});

module.exports = router;