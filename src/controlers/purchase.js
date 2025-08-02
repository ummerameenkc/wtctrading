const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const BigNumber = require('bignumber.js');
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const  {getStock,stockUpdate,itemCostUpdate}   = require('../models/stock');
const { exit } = require('process');
const  {Transaction}   = require('../utils/TranDB');

let    db = new Database();
let    Tran = new Transaction();



let getPurOrderInv = async (req,res,next)=>{
    let [purError,pur] =  await _p(db.query(`select pur_o_id  from tbl_purchase_order_master  order by pur_o_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(purError){
        next(purError)
    }
    let purCode = '';
    if(pur.length == 0){
        purCode = 'PO1';
    }else{
        purCode = 'PO'+(parseFloat(pur[0].pur_o_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(purCode)
    })
}

let getPurVoucherNo = async (req,res,next)=>{
    let [purError,pur] =  await _p(db.query(`select pur_id  from tbl_purchase_master  order by pur_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(purError){
        next(purError)
    }
    let purCode = '';
    if(pur.length == 0){
        purCode = 'PUR1';
    }else{
        purCode = 'PUR'+(parseFloat(pur[0].pur_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(purCode)
    })
}

let getPurReturnVoucherNo = async (req,res,next)=>{
    let [purError,pur] =  await _p(db.query(`select pur_r_id  from tbl_purchase_return_master
      order by pur_r_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(purError){
        next(purError)
    }
    let purCode = '';
    if(pur.length == 0){
        purCode = 'PURR1';
    }else{
        purCode = 'PURR'+(parseFloat(pur[0].pur_r_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(purCode)
    })
}

router.get('/api/get-purchase-return-voucher-no',async(req,res,next)=>{  
    res.json(await  getPurReturnVoucherNo(req,res,next));
});


router.get('/api/get-purchase-voucher-no',async(req,res,next)=>{  
    res.json(await  getPurVoucherNo(req,res,next));
});

router.get('/api/get-purchase-order-invoice',async(req,res,next)=>{  
    res.json(await  getPurOrderInv(req,res,next));
});




router.post('/api/create-purchase-order',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let supplier = para.supplier;
    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
       
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a' `,[supplier.acc_name,req.user.user_branch_id])).then(res=>{
            return res;
        });
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.creation_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [suppEntyErr,suppEnty] =  await _p(db.insert('tbl_accounts',supplierData)).then((row)=>{
            return row;
        })
        masterData.acc_id = suppEnty.insertId;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.pur_order_no = await  getPurOrderInv(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.insert('tbl_purchase_order_master',masterData)).then((row)=>{
            return row;
        });
    // Save Master Data - End

    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                pur_o_id: masterEnrty.insertId,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_qty: item.pur_qty,
                pur_rate: item.pur_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_purchase_order_details',cartData)).then((row)=>{
                return row;
            });

            // Save Serial Data - start
            item.serials.map(async(serial)=>{
                let serialData = {
                    serial_number: serial.serial_number,
                    item_id: item.item_id,
                    status: 'ordered',
                    branch_id: req.user.user_branch_id,
                }
                await _p(db.insert('tbl_item_serials',serialData)).then((row)=>{
                    return row;
                });
            })
            // Save Serial End - start

        // Save Detail Data - End
        });
    

    res.json({error:false,message:'Purchase order created Successfully.',pur_o_id: masterEnrty.insertId});
});



router.post('/api/update-purchase-order',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let supplier = para.supplier;
    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a' `,[supplier.acc_name,req.user.user_branch_id,supplier.acc_id =='G'?'general':''])).then(res=>{
            return res;
        });
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.creation_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [suppEntyErr,suppEnty] =  await _p(db.insert('tbl_accounts',supplierData)).then((row)=>{
            return row;
        })
        masterData.acc_id = suppEnty.insertId;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.update('tbl_purchase_order_master',masterData,{pur_o_id : para.pur_o_id})).then((row)=>{
            return row;
        });

    // Save Master Data - End
    // Delete Previous Detail data - start 

    // Old 
    let [detailsErr,details] =  await _p(db.query(` select serials from tbl_purchase_order_details where pur_o_id = ${para.pur_o_id} `)).then((row)=>{
        return row;
    });

    details.map(async(detail)=>{
        let serials = []
        
        serials = detail.serials.split(',');
        if(serials.length != 0){
          serials = serials.map((slNo)=>{
            return {serial_number : slNo}
          })
        }else{
          serials = []
        }

        serials.map(async(serial)=>{
            let [previousCheckErr,previousCheck] =   await _p(db.query(`select serial_number,status from tbl_item_serials   where serial_number=? `,[serial.serial_number]).then((res=>{
                return res;
              })));

              if(previousCheck.length != 0 && previousCheck[0].status =='ordered'){
                  await _p(db.delete('tbl_item_serials',{serial_number: serial.serial_number}).then((result)=>{
                    return result;
                  }));
               }
        })



    })

    // End
     await _p(db.delete(`tbl_purchase_order_details`,{pur_o_id : para.pur_o_id}).then((res)=>{
        return res;
     }));


    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                pur_o_id: para.pur_o_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,

                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_qty: item.pur_qty,
                pur_rate: item.pur_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_purchase_order_details',cartData)).then((row)=>{
                return row;
            });

            // Save Serial Data - start
            item.serials.map(async(serial)=>{
                let [previousCheckErr,previousCheck] =   await _p(db.query(`select serial_number,status from tbl_item_serials   where serial_number=? `,[serial.serial_number]).then((res=>{
                    return res;
                  })));

                  if(previousCheck.length != 0 && previousCheck[0].status !='ordered'){
                    let serialData = {
                      item_id: item.item_id
                      }
                      await _p(db.update('tbl_item_serials',serialData,{serial_number: serial.serial_number}).then((result)=>{
                        return result;
                      }));
                   }else{
                    let serialData = {
                        serial_number : serial.serial_number,
                        item_id: item.item_id,
                        status: 'ordered',
                        branch_id : req.user.user_branch_id,
                     }
                      await _p(db.insert('tbl_item_serials',serialData).then((result)=>{
                        return result;
                      }));

      
                   }
      
            })
            // Save Serial End - start

        // Save Detail Data - End
        });
    

    res.json({error:false,message:'Purchase order updated Successfully.',pur_o_id: para.pur_o_id});
});


router.post(`/api/purchase-order-delete`,async(req,res,next)=>{
    let para = req.body;
    await _p(db.update('tbl_purchase_order_master',{status:'d'},{pur_o_id : para.pur_o_id})).then((row)=>{
        return row;
    });

    await _p(db.update('tbl_purchase_order_details',{status:'d'},{pur_o_id : para.pur_o_id})).then((row)=>{
        return row;
    });

   let [detailsErr,details] =  await _p(db.query(` select serials from tbl_purchase_order_details where pur_o_id = ${para.pur_o_id} `)).then((row)=>{
        return row;
    });

    details.map(async(detail)=>{
        let serials = []
        
        serials = detail.serials.split(',');
        if(serials.length != 0){
          serials = serials.map((slNo)=>{
            return {serial_number : slNo}
          })
        }else{
          serials = []
        }

        serials.map(async(serial)=>{
            let [previousCheckErr,previousCheck] =   await _p(db.query(`select serial_number,status from tbl_item_serials   where serial_number=? `,[serial.serial_number]).then((res=>{
                return res;
              })));

              if(previousCheck.length != 0 && previousCheck[0].status =='ordered'){
                  await _p(db.delete('tbl_item_serials',{serial_number: serial.serial_number}).then((result)=>{
                    return result;
                  }));
               }
        })



    })

    res.json({error:false,message:'Purchase order deleted Successfully.'});
})

router.post(`/api/sales-quotation-delete`,async(req,res,next)=>{ 
    let para = req.body;
    await _p(db.update('tbl_sales_quotation_master',{status:'d'},{sale_o_id : para.sale_o_id})).then((row)=>{
        return row;
    });

    await _p(db.update('tbl_sales_quotation_details',{status:'d'},{sale_o_id : para.sale_o_id})).then((row)=>{
        return row;
    });

   

 

    res.json({error:false,message:'Sales Quotation deleted Successfully.'});
})

router.post(`/api/sales-order-delete`,async(req,res,next)=>{
    let para = req.body;
    await _p(db.update('tbl_sales_order_master',{status:'d'},{sale_o_id : para.sale_o_id})).then((row)=>{
        return row;
    });

    await _p(db.update('tbl_sales_order_details',{status:'d'},{sale_o_id : para.sale_o_id})).then((row)=>{
        return row;
    });

   let [detailsErr,details] =  await _p(db.query(` select serials from tbl_sales_order_details where sale_o_id = ${para.sale_o_id} `)).then((row)=>{
        return row;
    });

    details.map(async(detail)=>{
        let serials = []
        
        serials = detail.serials.split(',');
        if(serials.length != 0){
          serials = serials.map((slNo)=>{
            return {serial_number : slNo}
          })
        }else{
          serials = []
        }

        serials.map(async(serial)=>{
            let [previousCheckErr,previousCheck] =   await _p(db.query(`select serial_number,status from tbl_item_serials   where serial_number=? `,[serial.serial_number]).then((res=>{
                return res;
              })));

              if(previousCheck.length != 0 && previousCheck[0].status =='ordered'){
                  await _p(db.delete('tbl_item_serials',{serial_number: serial.serial_number}).then((result)=>{
                    return result;
                  }));
               }
        })



    })

    res.json({error:false,message:'Sales order deleted Successfully.'});
})

router.post(`/api/purchase-delete-check`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
   

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_purchase_details   where pur_id=? and status = 'a' `,[para.pur_id], transaction)
   
       let serials = []
        for(detail of oldPurDetail){
        let sls = detail.serials.trim() != '' ? detail.serials.split(',') : [];
        serials = sls.concat(serials)

        }

        let possiable = 'yes'
        if(serials.length != 0){
            const placeholders = serials.map(() => '?').join(', ');
            const values = [...serials, req.user.user_branch_id];
            let exists = await Tran.countRows(`select * from tbl_item_serials   where serial_number in (${placeholders}) and branch_id = ? and status = 'in' `,values, transaction)
            if(serials.length == exists){
                possiable = 'yes'
            }else{
                possiable = 'no'
            }
        }
        
       
    await transaction.commit();

    res.json({error:false,message: possiable});

    }
    catch (err) {
        await transaction.rollback();
        next(err);
    }
})


router.post(`/api/purchase-return-delete-check`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
   

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_purchase_return_details   where pur_r_id=? and status = 'a' `,[para.pur_r_id], transaction)
   
       let serials = []
        for(detail of oldPurDetail){
        let sls = detail.serials.trim() != '' ? detail.serials.split(',') : [];
        serials = sls.concat(serials)

        }

        let possiable = 'yes'
        if(serials.length != 0){
            const placeholders = serials.map(() => '?').join(', ');
            const values = [...serials, req.user.user_branch_id];
            let exists = await Tran.countRows(`select * from tbl_item_serials   where serial_number in (${placeholders}) and branch_id = ? and status = 'out' `,values, transaction)
            if(serials.length == exists){
                possiable = 'yes'
            }else{
                possiable = 'no'
            }
        }
        
       
    await transaction.commit();

    res.json({error:false,message: possiable});

    }
    catch (err) {
        await transaction.rollback();
        next(err);
    }
})

router.post(`/api/purchase-delete`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
     await Tran.update(`tbl_purchase_master`,{status:'d'},{pur_id : para.pur_id},transaction)

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_purchase_details   where pur_id=? and status ='a' `,[para.pur_id], transaction)
   

        for(item of oldPurDetail){
        // Previous  Stock Check
        let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
        beforeStock = beforeStock[0].current_qty
        // End

         /// Product Avarage Calculation
          // purchase rate entry check 
        
        await stockUpdate('purchase_qty','minus',item.item_id,item.pur_qty,item.branch_id,item.warehouse_id,transaction)
        await itemCostUpdate('minus',item.item_id,item.pur_qty,item.pur_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
        }

      // Delete Detail

     await Tran.update(`tbl_voucher_transactions`,{status:'d'},{voucher_id : para.pur_id,voucher_type:'purchase'},transaction)
      /// End
        for(detail of oldPurDetail){
        let serials = []
        
        serials = detail.serials.split(',');
        if(serials.length != 0){
          serials = serials.map((slNo)=>{
            return {serial_number : slNo}
          })
        }else{
          serials = []
        }

        for(serial of serials){
                await Tran.delete(`tbl_item_serials`,{serial_number: serial.serial_number},transaction)
        }
    }


    await Tran.update(`tbl_purchase_details`,{status:'d'},{pur_id : para.pur_id},transaction)

    await transaction.commit();

    res.json({error:false,message:'Purchase  deleted Successfully.'});

    }
    catch (err) {
        await transaction.rollback();
        next(err);
    }
})

router.post(`/api/purchase-return-delete`,async(req,res,next)=>{

    let transaction; 
 
    try{ 
    transaction = await Tran.sequelize.transaction();
    let para = req.body;

    await Tran.update(`tbl_purchase_return_master`,{status:'d'},{pur_r_id : para.pur_r_id},transaction)

    
   // Old stock update
   let oldPurDetail = await Tran.selectByCond(` select * from tbl_purchase_return_details   where pur_r_id=? and status ='a' `,[para.pur_r_id], transaction)
 

    for(item of oldPurDetail){
      // Previous  Stock Check
      let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
      beforeStock = beforeStock[0].current_qty
      // End
      await stockUpdate('purchase_return_qty','minus',item.item_id,item.pur_r_qty,item.branch_id,item.warehouse_id,transaction)
      await itemCostUpdate('plus',item.item_id,item.pur_r_qty,item.pur_r_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
    }
     


    for(detail of oldPurDetail){
        let serials = []
        
        serials = detail.serials.split(',');
        if(serials.length != 0){
          serials = serials.map((slNo)=>{
            return {serial_number : slNo}
          })
        }else{
          serials = []
        }

        for(serial of serials){
            await Tran.update(`tbl_item_serials`,{status:'in'},{serial_number: serial.serial_number},transaction)
        }
    }


    await Tran.update(`tbl_purchase_return_details`,{status:'d'},{pur_r_id : para.pur_r_id},transaction)

    await transaction.commit();

    res.json({error:false,message:'Purchase Return  deleted Successfully.'});
}
catch (err) {
    await transaction.rollback();
    next(err);
}
   

})




router.post('/api/get-purchase-order-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pom.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pom.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pom.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select pom.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_purchase_order_master pom
            left join tbl_accounts acc on acc.acc_id = pom.acc_id
            left join tbl_users u on u.user_id = pom.created_by
            where  pom.status != 'd'  
            and pom.branch_id = ? 
            ${cluases}
           
            order by pom.pur_o_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});


router.post('/api/get-purchase-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select pm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_purchase_master pm
            left join tbl_accounts acc on acc.acc_id = pm.acc_id
            left join tbl_users u on u.user_id = pm.created_by
            where  pm.status != 'd'  
            and pm.branch_id = ? 
            ${cluases}
           
            order by pm.pur_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-purchase-return-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and prm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and prm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and prm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select prm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_purchase_return_master prm
            left join tbl_accounts acc on acc.acc_id = prm.acc_id
            left join tbl_users u on u.user_id = prm.created_by
            where  prm.status != 'd'  
            and prm.branch_id = ? 
            ${cluases}
           
            order by prm.pur_r_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-purchase-order-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pom.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pom.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pom.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.pur_o_id != undefined && para.pur_o_id != null &&  para.pur_o_id != 0){
        cluases += ` and pom.pur_o_id = ${para.pur_o_id} `
    }

    if( para.pur_o_id == null && para.from =='voucher'){
        cluases += `  order by pom.pur_o_id desc limit 1 `
    }else{
        cluases += ` order by pom.pur_o_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select pom.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_purchase_order_master pom
            left join tbl_accounts acc on acc.acc_id = pom.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pom.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pom.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = pom.transport_acc_id
            left join tbl_users u on u.user_id = pom.created_by
            where  pom.status != 'd' 
            and pom.branch_id = ?  
            ${cluases}
           
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select pod.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,

            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_purchase_order_details pod
            left join tbl_warehouses w on w.warehouse_id  = pod.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pod.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pod.tax_acc_id
            left join tbl_items it on it.item_id = pod.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = pod.per_unit_id 
            where  pod.status != 'd'  
            and pod.pur_o_id = ? 
            `,[detail.pur_o_id])).then(res=>{
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
         


          itemData =  itemData.map(async(item)=>{




            
              let [purDataErr,purData] =  await _p(db.query(` select ifnull(sum(item_qty),0) as done_item_qty,
                      ifnull(sum(retail_qty),0) as done_retail_qty,ifnull(sum(pur_qty),0) as done_pur_qty
                        from  tbl_purchase_details 
                        where order_id = ? and item_id = ? and status='a'
                      `,[item.pur_o_id,item.item_id]).then(res=>{
                          return res
                      }));

                    item.done_item_qty =   purData.length != 0? purData[0].done_item_qty : 0;
                    item.done_retail_qty =   purData.length != 0? purData[0].done_retail_qty : 0;
                    item.done_pur_qty =   purData.length != 0? purData[0].done_pur_qty : 0;
                    return item;
           });
           




           

    detail.details = await  Promise.all(itemData)
    return detail;
    });


    res.json(await  Promise.all(data));
});


router.post('/api/get-purchase-order-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pom.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pom.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pod.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and pod.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select pod.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            pom.pur_order_no,
            pom.created_date,
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_purchase_order_details pod
            left join tbl_purchase_order_master pom on pom.pur_o_id  = pod.pur_o_id
            left join tbl_accounts acc on acc.acc_id = pom.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = pod.warehouse_id
            left join tbl_items it on it.item_id = pod.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  pod.status = 'a'
            and pod.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });
   

    res.json(details);
});



router.post('/api/get-purchase-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pd.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and pd.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select pd.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            pm.pur_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_purchase_details pd
            left join tbl_purchase_master pm on pm.pur_id  = pd.pur_id
            left join tbl_accounts acc on acc.acc_id = pm.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = pd.warehouse_id
            left join tbl_items it on it.item_id = pd.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  pd.status = 'a'
            and pm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });

    res.json(details);
});


router.post('/api/get-purchase-return-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and prm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and prm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and prm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and prd.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select prd.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            prm.pur_r_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_purchase_return_details prd
            left join tbl_purchase_return_master prm on prm.pur_r_id  = prd.pur_r_id
            left join tbl_accounts acc on acc.acc_id = prm.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = prd.warehouse_id
            left join tbl_items it on it.item_id = prd.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  prd.status = 'a'
            and prm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });


    res.json(details);
});

router.post(`/api/purchse-order-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  pom.pur_order_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select pom.pur_o_id,pom.pur_order_no as display_text
     from tbl_purchase_order_master pom
     where  pom.branch_id = ? 
     ${cluases}
     and pom.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
})


router.post(`/api/sales-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  sm.sale_voucher_no like  '%${req.body.query}%'  `
    }
    
    if(req.body.customerId != undefined && req.body.customerId != null){
        cluases += ` and  sm.acc_id =  '${req.body.customerId}'  `
    }



    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select sm.sale_id,sm.sale_voucher_no as display_text
     from tbl_sales_master sm
     where  sm.branch_id = ? 
     ${cluases}
     and sm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
})


router.post(`/api/purchse-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  pm.pur_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select pm.pur_id,pm.pur_voucher_no as display_text
     from tbl_purchase_master pm
     where  pm.branch_id = ? 
     ${cluases}
     and pm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
})

router.post(`/api/purchse-return-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  prm.pur_r_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select prm.pur_r_id,prm.pur_r_voucher_no as display_text
     from tbl_purchase_return_master prm
     where  prm.branch_id = ? 
     ${cluases}
     and prm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
});

router.post('/api/create-purchase',async(req,res,next)=>{  
   


    let transaction; 
      try{
        transaction = await Tran.sequelize.transaction();

        let para = req.body;
        let masterData = para.masterData;
        let supplier = para.supplier;

    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
       
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a' `,[supplier.acc_name,req.user.user_branch_id], transaction)
 
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.created_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id
        }
        let [suppEnty, _]  = await Tran.create(`tbl_accounts`,supplierData,transaction)

        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.pur_voucher_no = await  getPurVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  para.orderId;

        let [masterEnrty, _]  = await Tran.create(`tbl_purchase_master`,masterData,transaction)

    // Save Master Data - End

    // If it order to purchase
    if(req.body.orderId != 0){
        await Tran.update(`tbl_purchase_order_master`,{status:'c'},{pur_o_id:req.body.orderId},transaction)
    }

     para.payCart.map(async(pay)=>{
         let payData = {
            voucher_type : 'purchase',
            voucher_id   : masterEnrty,
            from_acc_id  : pay.from_acc_id,
            tran_amount  : pay.tran_amount,
            to_acc_id    : masterData.acc_id,
         }
         await Tran.create(`tbl_voucher_transactions`,payData,transaction)
  
     });
    // End Transaction
 
    // Save Detail Data - Start
            for(item of para.itemCart){

            // Previous  Stock Check
            let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
            beforeStock = beforeStock[0].current_qty
            // End


            let cartData = {
                pur_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_qty: item.pur_qty,
                pur_rate: item.pur_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id : para.orderId
            }
         
            // Save Serial Data - start
                for(serial of item.serials){
                let serialData = {
                    serial_number: serial.serial_number,
                    item_id: item.item_id,
                    status: 'in',
                    warehouse_id: item.warehouse_id,
                    branch_id: req.user.user_branch_id,
                }
                await Tran.create(`tbl_item_serials`,serialData,transaction)
            
            }
            // Save Serial End - start
 
            // update Currect Stock & Cost
            await stockUpdate('purchase_qty','plus',item.item_id,item.pur_qty,req.user.user_branch_id,item.warehouse_id,transaction)
  
            await itemCostUpdate('plus',item.item_id,item.pur_qty,item.pur_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)
            // end

            await Tran.create(`tbl_purchase_details`,cartData,transaction)
       
        // Save Detail Data - End
        }

         await transaction.commit();

        res.json({error:false,message:'Purchase  created Successfully.',pur_id: masterEnrty});


    }
    catch (err) {
        await transaction.rollback();
        next(err);
       }

    

});


router.post('/api/create-purchase-return',async(req,res,next)=>{  
 
let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
    let masterData = para.masterData;
    let supplier = para.supplier;

    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a'`,[supplier.acc_name,req.user.user_branch_id], transaction)
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.creation_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [suppEnty, _] = await Tran.create(`tbl_accounts`,supplierData,transaction)
      
        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.pur_r_voucher_no = await  getPurReturnVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  0;
        let [masterEnrty, _]  = await Tran.create(`tbl_purchase_return_master`,masterData,transaction)
    // Save Master Data - End


    // Save Detail Data - Start
            for(item of para.itemCart){

                 // Previous  Stock Check
                 let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
                 beforeStock = beforeStock[0].current_qty
                 // End
            let cartData = {
                pur_r_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_r_qty: item.pur_r_qty,
                pur_r_rate: item.pur_r_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id : para.orderId
            }
          
            // Save Serial Data - start
                for(serial of item.serials){
                let serialData = {
                    status: 'out',
                }
                await Tran.update(`tbl_item_serials`,serialData,{serial_number: serial.serial_number},transaction)
                }

                await stockUpdate('purchase_return_qty','plus',item.item_id,item.pur_r_qty,req.user.user_branch_id,item.warehouse_id,transaction)

                await itemCostUpdate('minus',item.item_id,item.pur_r_qty,item.pur_r_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)
            
                await Tran.create(`tbl_purchase_return_details`,cartData,transaction)
      }
    await transaction.commit();

    res.json({error:false,message:'Purchase Return  created Successfully.',pur_r_id: masterEnrty});

}catch (err) {
    await transaction.rollback();
    next(err);
   }
});

router.post('/api/get-purchase-order-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pom.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pom.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pom.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.pur_o_id != undefined && para.pur_o_id != null &&  para.pur_o_id != 0){
        cluases += ` and pom.pur_o_id = ${para.pur_o_id} `
    }

    if( para.pur_o_id == null && para.from =='voucher'){
        cluases += `  order by pom.pur_o_id desc limit 1 `
    }else{
        cluases += ` order by pom.pur_o_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select pom.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_purchase_order_master pom
            left join tbl_accounts acc on acc.acc_id = pom.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pom.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pom.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = pom.transport_acc_id
            left join tbl_users u on u.user_id = pom.created_by
            where  pom.status != 'd' 
            and pom.branch_id = ?  
            ${cluases}
           
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select pod.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_purchase_order_details pod
            left join tbl_warehouses w on w.warehouse_id  = pod.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pod.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pod.tax_acc_id
            left join tbl_items it on it.item_id = pod.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  pod.status != 'd'  
            and pod.pur_o_id = ? 
            `,[detail.pur_o_id])).then(res=>{
            return res;
           });

          itemData =  itemData.map(async(item)=>{
              let [purDataErr,purData] =  await _p(db.query(` select ifnull(sum(item_qty),0) as done_item_qty,
                      ifnull(sum(retail_qty),0) as done_retail_qty,ifnull(sum(pur_qty),0) as done_pur_qty
                        from  tbl_purchase_details 
                        where order_id = ? and item_id = ? and status='a'
                      `,[item.pur_o_id,item.item_id]).then(res=>{
                          return res
                      }));

                    item.done_item_qty =   purData.length != 0? purData[0].done_item_qty : 0;
                    item.done_retail_qty =   purData.length != 0? purData[0].done_retail_qty : 0;
                    item.done_pur_qty =   purData.length != 0? purData[0].done_pur_qty : 0;
                    return item;
           });


           

    detail.details = await  Promise.all(itemData)
    return detail;
    });


    res.json(await  Promise.all(data));
});



router.post('/api/get-purchase-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and pm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and pm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and pm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.pur_id != undefined && para.pur_id != null &&  para.pur_id != 0){
        cluases += ` and pm.pur_id = ${para.pur_id} `
    }

    if( para.pur_o_id == null && para.from =='voucher'){
        cluases += `  order by pm.pur_id desc limit 1 `
    }else{
        cluases += ` order by pm.pur_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select pm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             accpur.acc_name as purchase_acc_name
            from tbl_purchase_master pm
            left join tbl_accounts accpur on accpur.acc_id = pm.purchase_acc_id
            left join tbl_accounts acc on acc.acc_id = pm.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pm.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pm.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = pm.transport_acc_id
            left join tbl_users u on u.user_id = pm.created_by
            where  pm.status = 'a'
            and pm.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select pd.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,u.unit_id,u.base_unit_id,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_purchase_details pd
            left join tbl_warehouses w on w.warehouse_id  = pd.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = pd.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = pd.tax_acc_id
            left join tbl_items it on it.item_id = pd.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = pd.per_unit_id 
            where  pd.status = 'a'
            and pd.pur_id = ? 
            `,[detail.pur_id])).then(res=>{
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
    

   
    detail.details = itemData
    return detail;
    });

   

    data = await  Promise.all(data)

    data =  data.map(async(row)=>{
        let [voucherTransErr,voucherTrans] =  await _p(db.query(`select vt.from_acc_id,vt.tran_amount,acc.acc_name as from_acc_name
            from tbl_voucher_transactions vt
            left join tbl_accounts acc on acc.acc_id = vt.from_acc_id
            where vt.voucher_type = 'purchase' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.pur_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    })



    res.json(await  Promise.all(data));
});




router.post('/api/get-purchase-return-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and prm.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and prm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and prm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.pur_r_id != undefined && para.pur_r_id != null &&  para.pur_r_id != 0){
        cluases += ` and prm.pur_r_id = ${para.pur_r_id} `
    }

    if( para.pur_r_id == null && para.from =='voucher'){
        cluases += `  order by prm.pur_r_id desc limit 1 `
    }else{
        cluases += ` order by prm.pur_r_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select prm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             accr.acc_name as purchase_return_acc_name
            from tbl_purchase_return_master prm
            left join tbl_accounts accr on accr.acc_id = prm.purchase_return_acc_id
            left join tbl_accounts acc on acc.acc_id = prm.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = prm.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = prm.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = prm.transport_acc_id
            left join tbl_users u on u.user_id = prm.created_by
            where  prm.status = 'a'
            and prm.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select prd.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_purchase_return_details prd
            left join tbl_warehouses w on w.warehouse_id  = prd.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = prd.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = prd.tax_acc_id
            left join tbl_items it on it.item_id = prd.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = prd.per_unit_id 
            where  prd.status = 'a'
            and prd.pur_r_id = ? 
            `,[detail.pur_r_id])).then(res=>{
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

        
    detail.details = itemData
    return detail;
    });

   

    data = await  Promise.all(data)

    data =  data.map(async(row)=>{
        let [voucherTransErr,voucherTrans] =  await _p(db.query(`select vt.to_acc_id,vt.tran_amount,acc.acc_name as to_acc_name
            from tbl_voucher_transactions vt
            left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
            where vt.voucher_type = 'purchase_return' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.pur_r_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    })



    res.json(await  Promise.all(data));
});



router.post('/api/update-purchase',async(req,res,next)=>{  
  

    let transaction; 

        try{
            transaction = await Tran.sequelize.transaction();

            let para = req.body;
            let masterData = para.masterData;
            let supplier = para.supplier;
        


    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a' `,[supplier.acc_name,req.user.user_branch_id], transaction)

        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.creation_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [suppEnty, _]  = await Tran.create(`tbl_accounts`,supplierData,transaction)
     
        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  para.orderId

        await Tran.update(`tbl_purchase_master`,masterData,{pur_id : para.pur_id},transaction)
      
    // Save Master Data - End
      // Old stock update
      let oldPurDetail = await Tran.selectByCond(` select * from tbl_purchase_details   where pur_id=? and status = 'a' `,[para.pur_id], transaction)
   
        for(item of oldPurDetail){
          // Previous  Stock Check
          let beforeStock =  await  getStock(req,res,next,item.item_id,'',item.branch_id,item.warehouse_id,transaction);
          beforeStock = beforeStock[0].current_qty
          // End
          await stockUpdate('purchase_qty','minus',item.item_id,item.pur_qty,item.branch_id,item.warehouse_id,transaction)
          await itemCostUpdate('minus',item.item_id,item.pur_qty,item.pur_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
      }


      //end 
      await Tran.delete(`tbl_voucher_transactions`,{voucher_id : para.pur_id,voucher_type:'purchase',status:'a'},transaction)


      // Save Transaction
        for(pay of para.payCart){
        let payData = {
           voucher_type : 'purchase',
           voucher_id   : para.pur_id,
           from_acc_id  : pay.from_acc_id,
           tran_amount  : pay.tran_amount,
           to_acc_id    : masterData.acc_id,
        }
        await Tran.create(`tbl_voucher_transactions`,payData,transaction)
       
       }
   // End Transaction



    // Old 

    await Tran.delete(`tbl_purchase_details`,{pur_id : para.pur_id},transaction)
   

    // Save Detail Data - Start
            for(item of para.itemCart){
                 // Previous  Stock Check
                 let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
                 beforeStock = beforeStock[0].current_qty
                 // End
            let cartData = {
                pur_id: para.pur_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_qty: item.pur_qty,
                pur_rate: item.pur_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  para.orderId

            }
          

        /// Stock Update
        // Cost Update
        await stockUpdate('purchase_qty','plus',item.item_id,item.pur_qty,req.user.user_branch_id,item.warehouse_id,transaction)
        await itemCostUpdate('plus',item.item_id,item.pur_qty,item.pur_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)
        // end

        // Save Detail Data - End

        await Tran.create(`tbl_purchase_details`,cartData,transaction)

        }
        await transaction.commit();

         res.json({error:false,message:'Purchase  updated Successfully.',pur_id: para.pur_id});

      }
        catch (err) {
            await transaction.rollback();
            next(err);
        }
});


router.post('/api/update-purchase-return',async(req,res,next)=>{  
  

        let transaction; 

try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
    let masterData = para.masterData;
    let supplier = para.supplier;
 

    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a'`,[supplier.acc_name,req.user.user_branch_id,supplier.acc_id =='G'?'general':''], transaction)
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Supplier name already exists.`
            });
            return false
        }
        let supplierData = {
            acc_name:supplier.acc_name,
            acc_type_id:'creditor',
            acc_type_name:'Supplier',
            acc_type_label:'Supplier',
            institution_name:supplier.institution_name,
            address:supplier.address,
            contact_no:supplier.contact_no,
            creation_date : masterData.creation_date,
            party_type: supplier.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [suppEnty, _]  = await Tran.create(`tbl_accounts`,supplierData,transaction)
        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  0

        await Tran.update(`tbl_purchase_return_master`,masterData,{pur_r_id : para.pur_r_id},transaction)
    // Save Master Data - End

 

       // Old stock update
       let oldPurDetail = await Tran.selectByCond(`select * from tbl_purchase_return_details   where pur_r_id=? and status = 'a' `,[para.pur_r_id], transaction)
     
        for(item of oldPurDetail){
          // Previous  Stock Check
          let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
          beforeStock = beforeStock[0].current_qty
          // End

         /// Product Avarage Calculation
            // purchase rate entry check 
        await stockUpdate('purchase_return_qty','minus',item.item_id,item.pur_r_qty,item.branch_id,item.warehouse_id,transaction)
        await itemCostUpdate('plus',item.item_id,item.pur_r_qty,item.pur_r_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
      }



      await Tran.delete(`tbl_purchase_return_details`,{pur_r_id : para.pur_r_id},transaction)

    // Save Detail Data - Start
        for(item of para.itemCart){
                      // Previous  Stock Check
          let beforeStock =  await getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
          beforeStock = beforeStock[0].current_qty
          // End

            let cartData = {
                pur_r_id: para.pur_r_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_tax: item.item_tax,
                tax_acc_id: item.tax_acc_id,
                item_discount: item.item_discount,
                item_discount_per: item.item_discount_per,
                item_rate: item.item_rate,
                item_total: item.item_total,
                discount_acc_id: item.discount_acc_id,
                item_tax_per: item.item_tax_per,
                pur_r_qty: item.pur_r_qty,
                pur_r_rate: item.pur_r_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  0

            }
        
            await stockUpdate('purchase_return_qty','plus',item.item_id,item.pur_r_qty,req.user.user_branch_id,item.warehouse_id,transaction)

            await itemCostUpdate('minus',item.item_id,item.pur_r_qty,item.pur_r_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)

            // Save Detail Data - End
            await Tran.create(`tbl_purchase_return_details`,cartData,transaction)

        }
    
    await transaction.commit();

    res.json({error:false,message:'Purchase Return Updated Successfully.',pur_r_id: para.pur_r_id});

}
catch (err) {
        await transaction.rollback();
        next(err);
       }



});

module.exports = router;