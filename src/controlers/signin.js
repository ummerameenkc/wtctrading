const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const {check}= require('express-validator');
const {validate} = require('../utils/passwords');
const tokenSession= require('../utils/token_session');
const {app_secret,license_key}  = require("../config.json");
const clientPackage  = require("../client_package.json");
const rejectInvalid = require('../middlewares/reject_invalid');
 const  {Database}   = require('../utils/Database');
const _p      = require('../utils/promise_error');
const si = require('systeminformation');
const { getCurrentISODT } = require('../utils/functions');


let    db = new Database();


const loginValidation = [
    check('user_name').exists(),
    check('user_password').isLength({min:6})
]

router.post('/tester',async(req,res,next)=>{
    let shunks = tokenSession.generate(license_key);
    let token = `${shunks.salt}.${shunks.hash}.${shunks.timestamp}`;

     await _p(db.query(` UPDATE tbl_watch_token
     SET token = '${token}' `)).then(res=>{
        return res;
    });
    tokenStatus = "renewed"
    res.json('ok')
})



router.post('/license-key-checker',async (req,res,next)=>{  

        let tokenStatus = ""


        //  Check Package Expired Or Not
        let [,countToken] =  await _p(db.countRows(`select * from tbl_watch_token  `)).then(row=>{
            return row;
        });

        if(countToken != 0 ){
              // check valid token or not

              let [,prevToken] = await _p(db.query(`select * from tbl_watch_token limit 1 `)).then(row=>{
                return row;
            });
  
            let [salt, hash, ...timestampParts] = prevToken[0]['token'].split('.');
            const timestamp = timestampParts.join('.');

        let tokenValid = tokenSession.validate(req.body.license_key,hash,salt,timestamp);


        if(!tokenValid){
            return  res.status(200).json({
                error:true,
                message:`Not Valid License Key !`
                })
        }

        }else{
            return  res.status(200).json({
                error:true,
                message:` License Key is not Generated  !`
                })
        }


  
            let [,prevToken] = await _p(db.query(`select * from tbl_watch_token limit 1 `)).then(row=>{
                return row;
            });
  
            let [salt, hash, ...timestampParts] = prevToken[0]['token'].split('.');
            const timestamp = timestampParts.join('.');
            const savedPasswordInfo = {
                salt,
                hash,
                timestamp,
              };

              const isOldEnoughSaved = tokenSession.isPasswordOldEnough(savedPasswordInfo); 


            if(isOldEnoughSaved == false){
                tokenStatus = "not_expired"
            }else{
                // Renew token / update token

                let shunks = tokenSession.generate(license_key);
                let token = `${shunks.salt}.${shunks.hash}.${shunks.timestamp}`;
      
                 await _p(db.query(` UPDATE tbl_watch_token
                 SET token = '${token}' `)).then(res=>{
                    return res;
                });
                tokenStatus = "renewed"


            }
        
        // end
        if(tokenStatus == 'not_expired'){
            return  res.status(200).json({
                error:true,
                message:`Not Expired !   (${clientPackage.days} Days Package) `
                })
        }

        if(tokenStatus == 'renewed'){
            return  res.status(200).json({
                error:false,
                message:`Congratulations ! Renew Success.`
                })
        }

});


router.post('/signin',loginValidation,rejectInvalid,async (req,res,next)=>{  

    if(clientPackage.renewal != undefined && clientPackage.renewal == 'yes'){

        let tokenStatus = ""


        // Check Device Permission by PC Serial
        if(clientPackage.type == 'offline'){
            const systemInfo = await si.system();
            const serialNumber = systemInfo.serial;
    
            if(clientPackage.serial_no != serialNumber){
                return  res.status(200).json({
                    error:true,
                    message:`This Device  Not Allowed !  `
                    })
            }    
        }
       
        //  Check Package Expired Or Not
        let [,countToken] =  await _p(db.countRows(`select * from tbl_watch_token  `)).then(row=>{
            return row;
        });


        if(countToken != 0){
            let [,prevToken] = await _p(db.query(`select * from tbl_watch_token limit 1 `)).then(row=>{
                return row;
            });
  
            let [salt, hash, ...timestampParts] = prevToken[0]['token'].split('.');
            const timestamp = timestampParts.join('.');
            const savedPasswordInfo = {
                salt,
                hash,
                timestamp,
              };

              const isOldEnoughSaved = tokenSession.isPasswordOldEnough(savedPasswordInfo); 

console.log(isOldEnoughSaved)
            if(isOldEnoughSaved){
                tokenStatus = "expired"
            }

        }
        // end
        if( countToken == 0 || tokenStatus == 'expired'){
            return  res.status(200).json({
                error:true,
                message:`Kindly Renew !   (${clientPackage.days} Days Expired) `
                })
        }
        }

        let {user_name,user_password} = req.body;
        let tableName = `tbl_users`;
        let [checkUserErr,checkUserData] = await _p(db.query(`select u.*,b.branch_name,ins.is_warehouse,ins.currency,ins.is_cal_type,ins.is_serial,ins.is_voucher_receipt,ins.is_auto_challan,ins.is_minus_stock_sale
         from ${tableName} u 
         left join tbl_branches b on b.branch_id = u.user_branch_id
         left join tbl_institution_profile ins on ins.pro_branch_id = u.user_branch_id
         left join tbl_warehouses w on w.warehouse_id = u.user_warehouse_id
         where   u.user_status='active' and u.user_name=? COLLATE utf8mb3_bin `,[user_name]).then(result=>{
              return result;
        }))
    
        if(checkUserErr && !checkUserData){
            return next(checkUserErr)
        }else{
            if(checkUserData.length<1){
                
                return  res.status(200).json({
                    error:true,
                    message:"Invalid username."
                    })
            }else{
                
                let [salt,hash] = checkUserData[0]['user_password'].split('.');
                let {user_id,user_email,user_name,user_full_name,user_role,user_branch_id,user_warehouse_id,branch_name,is_warehouse,currency,is_cal_type,is_serial,customer_id,acc_type,is_voucher_receipt,is_auto_challan,is_minus_stock_sale,user_access} = checkUserData[0];
                let valid = validate(user_password,hash,salt);
                if(valid){
                    let token = jwt.sign({user_id,user_name,user_full_name,user_email,user_role,user_branch_id,user_warehouse_id,branch_name,is_warehouse,currency,is_cal_type,is_serial,customer_id,acc_type,is_voucher_receipt,is_auto_challan,is_minus_stock_sale,user_access},app_secret);
                    
    
                    let [institutionErr,institution] =  await _p(db.query(`select pro_name from tbl_institution_profile where pro_branch_id=? `,[user_branch_id]).then(res=>{
                        return res;
                    }))
    
                    res.status(200).json({
                        error:false,
                        auth:true,
                        token,
                        message:"Congratulations!! Success.",
                        userInfo:{
                            user_id,user_name,user_full_name,user_email,user_role,
                            user_branch_id,user_warehouse_id,
                            branch_name
                        },
                        access:user_access,
                        customer_id,
                        acc_type,
                        is_warehouse,
                        is_auto_challan,
                        is_minus_stock_sale,
                        currency,
                        is_cal_type,
                        is_serial,
                        role:user_role,
                        is_voucher_receipt,
                        institution:institution.length==0?'SoftTask':institution[0].pro_name
    
                    });
                }else{
                    res.status(200).json({
                        error:true,
                        message:"Sorry !! wrong password." 
                     })
                }
            }
        }
    
});



router.post('/api/switch-branch',async (req,res,next)=>{
    let {user_password,new_branch_id,new_branch_name} = req.body;
    let tableName = `tbl_users`;
    let [checkUserErr,checkUserData] = await _p(db.query(`select u.*,b.branch_name,w.warehouse_name,ins.is_warehouse,ins.currency,ins.is_cal_type,ins.is_serial
     from ${tableName} u 
     left join tbl_branches b on b.branch_id = u.user_branch_id
     left join tbl_institution_profile ins on ins.pro_branch_id = ${new_branch_id}
     left join tbl_warehouses w on w.warehouse_id = u.user_warehouse_id
     where u.user_name=? and u.user_status='active'    `,[req.user.user_name]).then(result=>{
          return result;
    }))

    if(checkUserErr && !checkUserData){
        return next(checkUserErr)
    }else{
        if(checkUserData.length<1){
            
            return  res.status(200).json({
                error:true,
                message:"Invalid username."
                })
        }else{
            
            let [salt,hash] = checkUserData[0]['user_password'].split('.');
            let {user_id,user_email,user_name,user_full_name,user_role,user_branch_id,user_warehouse_id,branch_name,warehouse_name,is_warehouse,currency,is_cal_type,is_serial,user_access} = checkUserData[0];
            let valid = validate(user_password,hash,salt);
            if(valid){
                let token = jwt.sign({user_id,user_name,user_full_name,user_email,user_role,user_branch_id:new_branch_id,user_warehouse_id,branch_name:new_branch_name,warehouse_name,is_warehouse,currency,is_cal_type,is_serial,user_access},app_secret);
                

                let [institutionErr,institution] =  await _p(db.query(`select pro_name from tbl_institution_profile where pro_branch_id=? `,[user_branch_id]).then(res=>{
                    return res;
                }))

                res.status(200).json({
                    error:false,
                    auth:true,
                    token,
                    message:"Congratulations!! Success.",
                    userInfo:{
                        user_id,user_name,user_full_name,user_email,user_role,
                        user_branch_id:new_branch_id,user_warehouse_id,
                        branch_name:new_branch_name,warehouse_name
                    },
                    access:user_access,
                    is_warehouse,
                    currency,
                    is_cal_type,
                    is_serial,
                    role:user_role,
                    institution:institution.length==0?'SoftTask':institution[0].pro_name

                });
            }else{
                res.status(200).json({
                    error:true,
                    message:"Sorry !! wrong password." 
                 })
            }
        }
    }
});



module.exports = router;