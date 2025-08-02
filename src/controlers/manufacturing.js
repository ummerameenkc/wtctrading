const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const BigNumber = require('bignumber.js');

const  {Database}   = require('../utils/Database');
const  {Transaction}   = require('../utils/TranDB');
const  {getStock,stockUpdate,itemCostUpdate}   = require('../models/stock');

const { exit } = require('process');
let    db = new Database();
let    Tran = new Transaction();


let getManuInv = async (req,res,next)=>{
    let [manuError,manu] =  await _p(db.query(`select mf_id   from tbl_manufacturing_master
    
      order by mf_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(manuError){
        next(manuError)
    }
    let manuCode = '';
    if(manu.length == 0){
        manuCode = 'MF1';
    }else{
        manuCode = 'MF'+(parseFloat(manu[0].mf_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(manuCode)
    })
}


router.get('/api/get-manufacturing-voucher-no',async(req,res,next)=>{  
    res.json(await  getManuInv(req,res,next));
});




router.post('/api/create-manufacturing',async(req,res,next)=>{  
  let transaction; 
  try{
    transaction = await Tran.sequelize.transaction();
    let para = req.body;
        let masterData = para.masterData;
   

    // Save Master Data - Start
        masterData.mf_voucher_no = await  getManuInv(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        
        let [masterEnrty, _]  = await Tran.create(`tbl_manufacturing_master`,masterData,transaction)
    // Save Master Data - End

    // Save Production item  Data - Start
          for(item of para.itemCart){

              // Previous  Stock Check 
              let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
              beforeStock = beforeStock[0].current_qty
              // End

            let cartData = {
                mf_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
               
                item_rate: item.item_rate,
                item_total: item.item_total,
                item_percentage: item.item_percentage,
              
                pd_qty: item.pd_qty,
                pd_rate: item.pd_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await Tran.create(`tbl_manufactured_items`,cartData,transaction)
        
               /// Product Avarage Calculation
            // purchase rate entry check  
            
            await stockUpdate('production_qty','plus',item.item_id,item.pd_qty,req.user.user_branch_id,item.warehouse_id,transaction)

            await itemCostUpdate('plus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)

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

        // Production item - End
        }


         // Save Production item  Data - Start
          for(item of para.rawCart){
            let rawCartData = {
                mf_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                raw_item_qty: item.raw_item_qty,
               
                raw_item_rate: item.raw_item_rate,
                raw_item_total: item.raw_item_total,
              
                raw_qty: item.raw_qty,
                raw_rate: item.raw_rate,
                raw_retail_qty: item.raw_retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await Tran.create(`tbl_manufacturing_consume_items`,rawCartData,transaction)

            await stockUpdate('consume_qty','plus',item.item_id,item.raw_qty,req.user.user_branch_id,item.warehouse_id,transaction)


            // Save Serial Data - start
              for(serial of item.serials){
                let serialData = {
                    status: 'out',
                }
                await Tran.update(`tbl_item_serials`,serialData,{serial_number: serial.serial_number},transaction)
            }
            // Save Serial End - start

        // Production item - End
        }
    
    await transaction.commit();
    res.json({error:false,message:'Manufacturing created Successfully.',mf_id: masterEnrty});

  }catch (err) {
        await transaction.rollback();
        next(err);
  }
});

router.post(`/api/manufacturing-delete`,async(req,res,next)=>{
  let transaction; 
  try{
    transaction = await Tran.sequelize.transaction();

    let mf_id = req.body.mf_id
    await Tran.update(`tbl_manufacturing_master`,{status:'d'},{mf_id : mf_id},transaction)

     // Old stock update
     let oldMDetail = await Tran.selectByCond(`select * from tbl_manufactured_items   where mf_id=? and status='a' `,[mf_id], transaction)
   
      for(item of oldMDetail){
          // Previous  Stock Check
          let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
          beforeStock = beforeStock[0].current_qty
          // End
          await stockUpdate('production_qty','minus',item.item_id,item.pd_qty,item.branch_id,item.warehouse_id,transaction)
          await itemCostUpdate('minus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
      }

      // end
      let oldMItemDetail = await Tran.selectByCond(`select * from tbl_manufactured_items   where mf_id=? and status='a' `,[mf_id], transaction)
    
      for(detail of oldMItemDetail){
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

    await Tran.update(`tbl_manufactured_items`,{status:'d'},{mf_id : mf_id},transaction)

    let oldMConsumeDetail = await Tran.selectByCond(`select * from tbl_manufacturing_consume_items   where mf_id=?  and status='a' `,[mf_id], transaction)

   for(detail of oldMConsumeDetail){
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

        await stockUpdate('consume_qty','minus',detail.item_id,detail.raw_qty,detail.branch_id,detail.warehouse_id,transaction)
    }

    await Tran.update(`tbl_manufacturing_consume_items`,{status:'d'},{mf_id : mf_id},transaction)


    await transaction.commit();
    res.json({error:false,message:'Manufacturing deleted Successfully.'});

  }catch (err) {
        await transaction.rollback();
        next(err);
  }
})





router.post('/api/update-manufacturing',async(req,res,next)=>{  
  let transaction; 
  try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
        let masterData = para.masterData;
    // Save Master Data - Start

        delete masterData.mf_voucher_no 
        let [masterEnrty, _] = await Tran.update(`tbl_manufacturing_master`,masterData,{mf_id : masterData.mf_id},transaction)
    // Save Master Data - End


    // Old stock update
    let oldMDetail = await Tran.selectByCond(` select * from tbl_manufactured_items   where mf_id=? and status='a' `,[masterData.mf_id], transaction)

      for(item of oldMDetail){
          // Previous  Stock Check
          let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
          beforeStock = beforeStock[0].current_qty
          // End

          await stockUpdate('production_qty','minus',item.item_id,item.pd_qty,item.branch_id,item.warehouse_id,transaction)
          await itemCostUpdate('minus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)

          }

      // Old 
      await Tran.delete(`tbl_manufactured_items`,{mf_id : masterData.mf_id},transaction)
    // Save Production item  Data - Start
          for(item of para.itemCart){

             // Previous  Stock Check
             let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
             beforeStock = beforeStock[0].current_qty
             // End


            let cartData = {
                mf_id: masterData.mf_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
               
                item_rate: item.item_rate,
                item_total: item.item_total,
                item_percentage: item.item_percentage,
              
                pd_qty: item.pd_qty,
                pd_rate: item.pd_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await Tran.create(`tbl_manufactured_items`,cartData,transaction)

             /// Product Avarage Calculation
            // purchase rate entry check 
            
            await stockUpdate('production_qty','plus',item.item_id,item.pd_qty,req.user.user_branch_id,item.warehouse_id,transaction)

            await itemCostUpdate('plus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)


        // Production item - End
        }
        let oldMConsumeDetail = await Tran.selectByCond(` select * from tbl_manufacturing_consume_items   where mf_id=? and status='a' `,[masterData.mf_id], transaction)


      for(item of oldMConsumeDetail){
      
      await stockUpdate('consume_qty','minus',item.item_id,item.raw_qty,item.branch_id,item.warehouse_id,transaction)

      }
      await Tran.delete(`tbl_manufacturing_consume_items`,{mf_id : masterData.mf_id},transaction)

         // Save Production item  Data - Start
          for(item of para.rawCart){
            let rawCartData = {
                mf_id: masterData.mf_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                raw_item_qty: item.raw_item_qty,
               
                raw_item_rate: item.raw_item_rate,
                raw_item_total: item.raw_item_total,
              
                raw_qty: item.raw_qty,
                raw_rate: item.raw_rate,
                raw_retail_qty: item.raw_retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await Tran.create(`tbl_manufacturing_consume_items`,rawCartData,transaction)
        
            await stockUpdate('consume_qty','plus',item.item_id,item.raw_qty,req.user.user_branch_id,item.warehouse_id,transaction)


        // Production item - End
        }
    
    await transaction.commit();
    res.json({error:false,message:'Manufacturing updated Successfully.',mf_id: masterData.mf_id});
    }catch (err) {
          await transaction.rollback();
          next(err);
    }
});


router.post('/api/get-manufacturing-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

   
    if(para.userId != undefined && para.userId != null){
        cluases += ` and mm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and mm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
  



    if(para.mf_id  != undefined && para.mf_id  != null &&  para.mf_id  != 0){
        cluases += ` and mm.mf_id  = ${para.mf_id } `
    }

    if( para.mf_id  == null && para.from =='voucher'){
        cluases += `  order by mm.mf_id  desc limit 1 `
    }else{
        cluases += ` order by mm.mf_id  desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select mm.*,u.user_full_name
            from tbl_manufacturing_master mm
            left join tbl_users u on u.user_id = mm.created_by
            where  mm.status = 'a'
            and mm.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select mci.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name

            from tbl_manufacturing_consume_items mci
            left join tbl_warehouses w on w.warehouse_id  = mci.warehouse_id
            left join tbl_items it on it.item_id = mci.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = mci.per_unit_id 

            where  mci.status = 'a'
            and mci.mf_id = ? 
            `,[detail.mf_id])).then(res=>{
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
    detail.mciDetails = itemData
    return detail;
    });



     data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select mi.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name

            from tbl_manufactured_items mi
            left join tbl_warehouses w on w.warehouse_id  = mi.warehouse_id
            left join tbl_items it on it.item_id = mi.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = mi.per_unit_id 

            where  mi.status = 'a'
            and mi.mf_id = ? 
            `,[detail.mf_id])).then(res=>{
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
    detail.miDetails = itemData
    return detail;
    });

   

    data = await  Promise.all(data)

 


    res.json(await  Promise.all(data));
});


router.post(`/api/manufacturing-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  mm.mf_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select mm.mf_id,mm.mf_voucher_no as display_text
     from tbl_manufacturing_master mm
     where  mm.branch_id = ? 
     ${cluases}
     and mm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
});



router.post('/api/get-manufacturing-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.userId != undefined && para.userId != null){
        cluases += ` and mm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and mm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select mm.*,u.user_full_name
            from tbl_manufacturing_master mm
            left join tbl_users u on u.user_id = mm.created_by
            where  mm.status != 'd'  
            and mm.branch_id = ? 
            ${cluases}
           
            order by mm.mf_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

module.exports = router;