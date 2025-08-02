const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const  {getDetailStock,getStock,stockUpdate,itemCostUpdate,convertTotalStockToCurrentStock}   = require('../models/stock');
const BigNumber = require('bignumber.js');
const { exit } = require('process');
const  {Transaction}   = require('../utils/TranDB');

let    db = new Database();
let    Tran = new Transaction();


router.post(`/api/get-stock-value`,async(req,res,next)=>{
    res.json(await getStockValue(req,res,next))
})

let getStockValue = async (req,res,next)=>{
    let stock = await getStock(req,res,next,0,'no',req.user.user_branch_id,0);
    let getStockValue =  stock.reduce((prev,curr)=>{
        return prev+parseFloat(curr.stock_value)
    },0)

   return {stockValue : getStockValue}
}


router.post(`/api/get-current-stock`,async(req,res,next)=>{
        let itemId = req.body.itemId
        let warehouseId = req.body.warehouseId
        res.json(await getStock(req,res,next,itemId==undefined || itemId == 0 ? 0 : itemId,'current_stock',req.user.user_branch_id,warehouseId))
})

router.post(`/api/get-stock-report`,async(req,res,next)=>{
    let itemId = req.body.itemId
    let warehouseId = req.body.warehouseId
    res.json(await getStock(req,res,next,itemId==undefined || itemId == 0 ? 0 : itemId,'all',req.user.user_branch_id,warehouseId))
})

router.post(`/api/get-detail-stock`,async(req,res,next)=>{
        let itemId = req.body.itemId
        let warehouseId = req.body.warehouseId
        res.json(await getDetailStock(req,res,next,itemId==undefined || itemId == 0 ? 0 : itemId,'all',req.user.user_branch_id,warehouseId))
})



let getTransferInv = async (req,res,next)=>{
    let [transferError,transfer] =  await _p(db.query(`select t_id  from tbl_transfer_master  
    
    order by t_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(transferError){
        next(transferError)
    }
    let transferCode = '';
    if(transfer.length<1){
        transferCode = 'T1';
    }else{
        transferCode = 'T'+(parseFloat(transfer[0].t_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(transferCode)
    })
}

let getAdjustmentInv = async (req,res,next)=>{
    let [adjustError,adjust] =  await _p(db.query(`select adjust_id  from tbl_adjustment_master  
    
    order by adjust_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(adjustError){
        next(adjustError)
    }
    let adjustCode = '';
    if(adjust.length<1){
        adjustCode = 'ADJ1';
    }else{
        adjustCode = 'ADJ'+(parseFloat(adjust[0].adjust_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(adjustCode)
    })
}

router.get('/api/get-adjustment-voucher-no',async(req,res,next)=>{  
    res.json(await  getAdjustmentInv(req,res,next));
});


router.get('/api/get-transfer-voucher-no',async(req,res,next)=>{  

    res.json(await  getTransferInv(req,res,next));
});


router.post('/api/create-transfer', async (req, res, next) => {
    
    let transaction; // Declare the transaction variable outside the try-catch block
  
    try {
        const { masterData, itemCart } = req.body;

      // Start a Sequelize transaction 
      transaction = await Tran.sequelize.transaction();
  
      const status = masterData.to_branch_id === req.user.user_branch_id ? 'a' : 'p';

      // Save Master Data - Start
      masterData.t_voucher_no = await  getTransferInv(req,res,next);
      masterData.created_by   = req.user.user_id;  
      masterData.branch_id    = req.user.user_branch_id;
      masterData.status       = status;

  
      // Save Master Data - Start
      const [masterEntry, _] = await Tran.create('tbl_transfer_master',masterData,transaction)
      
   
      // Save Master Data - End
  
      // Save Detail Data - Start
      for (const item of itemCart) {

        let beforeStock = 0;
        if(status === 'a'){
            beforeStock =  await  getStock(req,res,next,item.item_id,'',masterData.to_branch_id,item.to_warehouse_id,transaction);
            beforeStock =  beforeStock[0].current_qty
        }

        const cartData = {
          t_id: masterEntry,
          serials: item.serials != null || item.serials != undefined ? item.serials.map((serial) => serial.serial_number).join(',') : '',
          item_id: item.item_id,
          per_unit_id: item.per_unit_id,
          to_branch_id: masterData.to_branch_id,
          from_warehouse_id: item.from_warehouse_id,
          to_warehouse_id: item.to_warehouse_id,
          item_qty: item.item_qty,
          item_rate: item.item_rate,
          item_total: item.item_total,
          t_qty: item.t_qty,
          t_rate: item.t_rate,
          retail_qty: item.retail_qty,
          created_date: masterData.created_date,
          branch_id: req.user.user_branch_id,
          status,
        };
     
        // Insert Detail Data and await the result
        await Tran.create('tbl_transfer_details',cartData,transaction);
   
        if (status === 'a') {
          // Save Serial Data - start
          for (const serial of item.serials) {
            const serialData = {
              item_id: item.item_id,
              status: 'in',
              warehouse_id: item.to_warehouse_id,
              branch_id: masterData.to_branch_id,
            };
  
            // Update Serial Data and await the result

            await Tran.update('tbl_item_serials',serialData,{serial_number: serial.serial_number},transaction)
          }
          
          // Save Serial End - start

          // If Active 
        // in to branch stock update
        await stockUpdate('transfer_in_qty','plus',item.item_id,item.t_qty,masterData.to_branch_id,item.to_warehouse_id,transaction)
        // in from branch stock update
        await stockUpdate('transfer_out_qty','plus',item.item_id,item.t_qty,req.user.user_branch_id,item.from_warehouse_id,transaction)

        await itemCostUpdate('plus',item.item_id,item.t_qty,item.t_rate,beforeStock,masterData.to_branch_id,item.to_warehouse_id,transaction)  
        
                 
          // end
        }
      }
      // Save Detail Data - End
  
      // Commit the transaction
      await transaction.commit();
  
      res.json({
        error: false,
        message: 'Transfer created Successfully.',
        t_id: masterEntry,
      });
    } catch (err) {
      // Rollback the transaction in case of an error
        await transaction.rollback();
        next(err);
    }
  });
  

router.post('/api/create-adjustment',async(req,res,next)=>{  
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        let para = req.body;
        let masterData = para.masterData;

    // Save Master Data - Start
        masterData.adjust_voucher_no = await  getAdjustmentInv(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.status       = 'a';
        let [masterEnrty, _]  = await Tran.create(`tbl_adjustment_master`,masterData,transaction)

    // Save Master Data - End


    // Save Detail Data - Start
    for(item of para.itemCart){


            let cartData = {
                adjust_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_rate: item.item_rate,
                item_total: item.item_total,
                adjust_qty: item.adjust_qty,
                adjust_rate: item.adjust_rate,
                retail_qty: item.retail_qty,
                adjust_type: item.adjust_type,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                status:'a',
            }
          
            await Tran.create(`tbl_adjustment_details`,cartData,transaction)
            await stockUpdate('damage_qty','plus',item.item_id,item.adjust_qty,req.user.user_branch_id,item.warehouse_id,transaction)
    
            // Save Serial Data - start

            for(serial of item.serials){
                let serialData = {
                    status:  'out',
                }
                 await Tran.update(`tbl_item_serials`,serialData,{serial_number: serial.serial_number},transaction)
            }

            // Save Serial End - start

        // Save Detail Data - End
        }
    
    await transaction.commit();
    res.json({error:false,message:'Adjustment  created Successfully.',adjust_id: masterEnrty});

    }catch (err) {
        await transaction.rollback();
        next(err);
       }
});


router.post('/api/get-transfer-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.to_branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   



    if(para.t_id != undefined && para.t_id != null &&  para.t_id != 0){
        cluases += ` and tm.t_id = ${para.t_id} `
    }


    if( para.from !='voucher'){
        cluases += `  and tm.branch_id =  ${req.user.user_branch_id} `
    }

    if( para.t_id == null && para.from =='voucher'){
        cluases += `  order by tm.t_id desc limit 1 `
    }else{
        cluases += ` order by tm.t_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as to_branch_name,
            b.branch_address as to_branch_address,
            transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_transfer_master tm
            left join tbl_accounts transport_acc on transport_acc.acc_id = tm.transport_acc_id
            left join tbl_branches b on b.branch_id = tm.to_branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where tm.status <>'d'    
            ${cluases}
             `)).then(res=>{
        return res;
    });

    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select td.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name
            
            from tbl_transfer_details td
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = td.per_unit_id 
            where td.status <>'d' and  td.t_id = ? 
            `,[detail.t_id])).then(res=>{
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


    res.json(await  Promise.all(data));
});



router.post('/api/get-transfer-pending-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   



    if(para.t_id != undefined && para.t_id != null &&  para.t_id != 0){
        cluases += ` and tm.t_id = ${para.t_id} `
    }

    if( para.t_id == null && para.from =='voucher'){
        cluases += `  order by tm.t_id desc limit 1 `
    }else{
        cluases += ` order by tm.t_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as to_branch_name,
            b.branch_address as to_branch_address,
            transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_transfer_master tm
            left join tbl_accounts transport_acc on transport_acc.acc_id = tm.transport_acc_id
            left join tbl_branches b on b.branch_id = tm.branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where  tm.status = 'p'
            and tm.to_branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select td.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name
            
            from tbl_transfer_details td
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  td.status = 'p'
            and td.t_id = ? 
            `,[detail.t_id])).then(res=>{
            return res;
    });
    detail.details = itemData
    return detail;
    });


    res.json(await  Promise.all(data));
});
router.post('/api/get-transfer-receive-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ` and tm.branch_id != ${req.user.user_branch_id} `

    if(para.fromBranchId != undefined && para.fromBranchId != null){
        cluases += ` and tm.branch_id = ${para.fromBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   



    if(para.t_id != undefined && para.t_id != null &&  para.t_id != 0){
        cluases += ` and tm.t_id = ${para.t_id} `
    }

    if( para.t_id == null && para.from =='voucher'){
        cluases += `  order by tm.t_id desc limit 1 `
    }else{
        cluases += ` order by tm.t_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as from_branch_name,
            b.branch_address as to_branch_address,
            transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_transfer_master tm
            left join tbl_accounts transport_acc on transport_acc.acc_id = tm.transport_acc_id
            left join tbl_branches b on b.branch_id = tm.branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where  tm.status = 'a'
            ${cluases}
             `)).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select td.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name
            
            from tbl_transfer_details td
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  td.status = 'a'
            and td.t_id = ? 
            `,[detail.t_id])).then(res=>{
            return res;
    });
    detail.details = itemData
    return detail;
    });


    res.json(await  Promise.all(data));
});

router.post('/api/update-transfer',async(req,res,next)=>{ 
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        let para = req.body;
        let masterData = para.masterData;
            masterData.status = 'p'
        let ms = await Tran.select(` select branch_id from tbl_transfer_master where t_id = ${para.t_id} `, transaction)
        
        let [masterEnrty, _] = await Tran.update(`tbl_transfer_master`,masterData,{t_id : para.t_id},transaction)
    
    // Save Master Data - End
    // Old 
  

    // End
    await Tran.delete(`tbl_transfer_details`,{t_id : para.t_id},transaction)
 
    
    // Save Detail Data - Start
            for(item of para.itemCart){
            let cartData = {
                t_id: para.t_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                to_branch_id: masterData.to_branch_id, 
                from_warehouse_id: item.from_warehouse_id,
                to_warehouse_id: item.to_warehouse_id,
                item_qty: item.item_qty,
                item_rate: item.item_rate,
                item_total: item.item_total,
                t_qty: item.t_qty,
                t_rate: item.t_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id : ms[0].branch_id,
                status:'p'
            }
             await Tran.create(`tbl_transfer_details`,cartData,transaction);
  
           
        }
    
    await transaction.commit(); 

    res.json({error:false,message:'Transfer  updated Successfully.',t_id: para.t_id});

    }catch(err){
        await transaction.rollback();
        next(err);
    }
});


router.post('/api/get-transfer-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.to_branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as to_branch_name,b.branch_address as to_branch_address,u.user_full_name
            from  tbl_transfer_master tm
            left join tbl_branches b on b.branch_id = tm.to_branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where tm.status <>'d' 
            and tm.branch_id = ? 
            ${cluases}
           
            order by tm.t_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-adjustment-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.userId != undefined && para.userId != null){
        cluases += ` and am.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and am.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select am.*,u.user_full_name
            from  tbl_adjustment_master am
            left join tbl_users u on u.user_id = am.created_by
            where  am.status = 'a'  
            and am.branch_id = ? 
            ${cluases}
           
            order by am.adjust_id  desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-transfer-receive-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ` and tm.branch_id != ${req.user.user_branch_id} `


    if(para.fromBranchId != undefined && para.fromBranchId != null){
        cluases += ` and tm.branch_id = ${para.fromBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as from_branch_name,b.branch_address as from_branch_address,u.user_full_name
            from  tbl_transfer_master tm
            left join tbl_branches b on b.branch_id = tm.branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where  tm.status = 'a'  
            ${cluases}
           
            order by tm.t_id desc
             `)).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});


router.post('/api/get-transfer-pending-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select tm.*,b.branch_name as to_branch_name,b.branch_address as to_branch_address,u.user_full_name
            from  tbl_transfer_master tm
            left join tbl_branches b on b.branch_id = tm.branch_id
            left join tbl_users u on u.user_id = tm.created_by
            where  tm.status = 'p'  
            and tm.to_branch_id = ${req.user.user_branch_id}
            ${cluases}
           
            order by tm.t_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-transfer-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.to_branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

   

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and td.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select td.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            tm.t_voucher_no,
          
            b.branch_name as to_branch_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name

            from tbl_transfer_details td
            left join tbl_transfer_master tm on tm.t_id  = td.t_id
            left join tbl_branches b on b.branch_id = tm.to_branch_id
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  td.status = 'a'
            and tm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });



    res.json(details);
});

router.post('/api/get-transfer-pending-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.toBranchId != undefined && para.toBranchId != null){
        cluases += ` and tm.to_branch_id = ${para.toBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and td.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select td.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            tm.t_voucher_no,
          
            b.branch_name as to_branch_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name

            from tbl_transfer_details td
            left join tbl_transfer_master tm on tm.t_id  = td.t_id
            left join tbl_branches b on b.branch_id = tm.to_branch_id
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  td.status = 'p'
            and tm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });



    res.json(details);
});


router.post('/api/get-transfer-receive-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ` and tm.branch_id != ${req.user.user_branch_id} `

    if(para.fromBranchId != undefined && para.fromBranchId != null){
        cluases += ` and tm.branch_id = ${para.fromBranchId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and tm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and tm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and td.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select td.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            tm.t_voucher_no,
          
            b.branch_name as to_branch_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name,
            fw.warehouse_name as from_warehouse_name,
            tw.warehouse_name as to_warehouse_name

            from tbl_transfer_details td
            left join tbl_transfer_master tm on tm.t_id  = td.t_id
            left join tbl_branches b on b.branch_id = tm.to_branch_id
            left join tbl_warehouses fw on fw.warehouse_id  = td.from_warehouse_id
            left join tbl_warehouses tw on tw.warehouse_id  = td.to_warehouse_id
            left join tbl_items it on it.item_id = td.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  td.status = 'a'
          
            ${cluases}
            `)).then(res=>{
            return res;
    });



    res.json(details);
});



router.post(`/api/transfer-delete`,async(req,res,next)=>{

    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        let para = req.body;
        await Tran.update(`tbl_transfer_master`,{status:'d'},{t_id : para.t_id},transaction)
        await Tran.update(`tbl_transfer_details`,{status:'d'},{t_id : para.t_id},transaction)
        
        await transaction.commit();
        res.json({error:false,message:'Transfer  Deleted Successfully.'});

    }catch (err) {
        await transaction.rollback();
        next(err);
       }
});



router.post(`/api/transfer-check`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
   

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_transfer_details   where t_id=? `,[para.t_id], transaction)
   
       let serials = []
        for(detail of oldPurDetail){
        let sls = detail.serials.trim() != '' ? detail.serials.split(',') : [];
        serials = sls.concat(serials)

        }

        let possiable = 'yes'
        if(serials.length != 0){
            const placeholders = serials.map(() => '?').join(', ');
            const values = [...serials, oldPurDetail[0].branch_id];
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

 
router.post(`/api/transfer-approve`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

        let para = req.body;
        await Tran.update(`tbl_transfer_master`,{status:'a'},{t_id : para.t_id},transaction)
       

        let details = await Tran.selectByCond(` select * from tbl_transfer_details where t_id = ? and status ='p' `,[para.t_id], transaction)

        for(detail of details){
            // Previous  Stock Check
            let beforeStock =  await  getStock(req,res,next,detail.item_id,'',detail.to_branch_id,detail.to_warehouse_id,transaction);
            beforeStock =  beforeStock[0].current_qty
            // End
            await Tran.update(`tbl_transfer_details`,{status:'a'},{t_d_id : detail.t_d_id},transaction)
            
            // in to branch stock update
            await stockUpdate('transfer_in_qty','plus',detail.item_id,detail.t_qty,detail.to_branch_id,detail.to_warehouse_id,transaction)
            // in from branch stock update
            await stockUpdate('transfer_out_qty','plus',detail.item_id,detail.t_qty,detail.branch_id,detail.from_warehouse_id,transaction)

            await itemCostUpdate('plus',detail.item_id,detail.t_qty,detail.t_rate,beforeStock,detail.to_branch_id,detail.to_warehouse_id,transaction)  
            
            

            let checkItemAva = await Tran.countRows(`select branch_ids from tbl_items where item_id=? and find_in_set(?,branch_ids)<>0`,[detail.item_id,detail.to_branch_id], transaction)

            if(checkItemAva==0){
                await Tran.updateQuery(`update tbl_items set branch_ids= concat(branch_ids,',${detail.to_branch_id}') where item_id=? `,[detail.item_id],transaction)
            }



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
                await Tran.update(`tbl_item_serials`,
                {
                    status:  'in',
                    warehouse_id: detail.to_warehouse_id,
                    branch_id: detail.to_branch_id,
                },
                {serial_number: serial.serial_number},transaction)  
            }
        } // End of Item Detail

        await transaction.commit();

        res.json({error:false,message:'Transfer  Approved Successfully.'});
        }catch (err) {
        await transaction.rollback();
        next(err);
    }
});


router.post(`/api/transfer-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  tm.t_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select tm.t_id,tm.t_voucher_no as display_text
     from tbl_transfer_master tm
     where  tm.branch_id = ? 
     ${cluases}
     and tm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
});



router.post(`/api/get-item-ledger`,async(req,res,next)=>{
    let payLoad = req.body;
    let dateFrom = payLoad.dateFrom;
    let dateTo = payLoad.dateTo;

    let [itemErr,item] =  await _p(db.query(`select ifnull(it.opening_qty,0) as opening_qty,ut.unit_symbol,ut.base_unit_id,ut.conversion,
        (
        select unit_symbol  from tbl_item_units   where unit_id = ut.base_unit_id
        ) as base_unit_name
        from tbl_items it
        left join tbl_item_units ut on ut.unit_id = it.unit_id
        where 
        it.status = "a"  
        and it.item_id = ${payLoad.itemId}

        `).then(res=>{
        return res;
        }))

        let conversion = item[0].conversion

        let dispalyText = ` ${conversion > 1 ? ` item_qty , ' ${item[0].unit_symbol} & ' , retail_qty, ' ${item[0].base_unit_name}'` : `item_qty , ' ${item[0].unit_symbol}'`} `
    

  let [expensesErr,expenses] =   await _p(db.query(` 
      select 

        '1' as sequence,
        pm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        pm.pur_voucher_no as vch_no,
        'Purchase' as vch_type,
        concat(${dispalyText}) as in_qty_display,
        '---' as out_qty_display,
        ifnull(pd.pur_qty,0) as in_qty,
        0 as out_qty

        from tbl_purchase_details pd
        left join tbl_purchase_master pm on pm.pur_id = pd.pur_id
        left join tbl_accounts acc on acc.acc_id = pm.acc_id
        where pd.status = 'a' 
        and pd.branch_id = ${req.user.user_branch_id} 
        and pd.item_id = ${payLoad.itemId}

        union select
        '2' as sequence,
        prm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        prm.pur_r_voucher_no as vch_no,
        'Purchase Return' as vch_type,
        '---' as in_qty_display,
        concat(${dispalyText}) as out_qty_display,
        0 as in_qty,
        ifnull(prd.pur_r_qty,0) as out_qty

        from tbl_purchase_return_details prd
        left join tbl_purchase_return_master prm on prm.pur_r_id = prd.pur_r_id
        left join tbl_accounts acc on acc.acc_id = prm.acc_id
        where prd.status = 'a' 
        and prd.branch_id = ${req.user.user_branch_id} 
        and prd.item_id = ${payLoad.itemId}

        union select
        '3' as sequence,
        sm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        sm.sale_voucher_no as vch_no,
        'Sale' as vch_type,
        '---' as in_qty_display,
        concat(${dispalyText}) as out_qty_display,
        0 as in_qty,
        ifnull(sd.sale_qty,0) as out_qty

        from tbl_sales_details sd
        left join tbl_sales_master sm on sm.sale_id = sd.sale_id
        left join tbl_accounts acc on acc.acc_id = sm.acc_id
        where sd.status = 'a' 
        and sd.branch_id = ${req.user.user_branch_id} 
        and sd.item_id = ${payLoad.itemId}

        union select
        '4' as sequence,
        srm.created_date as creation_date,
        concat(acc.acc_name) as particular,
        srm.sale_r_voucher_no as vch_no,
        'Sale Return' as vch_type,
        concat(${dispalyText}) as in_qty_display,
        '---' as out_qty_display,
        ifnull(srd.sale_r_qty,0) as in_qty,
        0 as out_qty

        from tbl_sales_return_details srd
        left join tbl_sales_return_master srm on srm.sale_r_id = srd.sale_r_id
        left join tbl_accounts acc on acc.acc_id = srm.acc_id
        where srd.status = 'a' 
        and srd.branch_id = ${req.user.user_branch_id} 
        and srd.item_id = ${payLoad.itemId}


        union select
        '5' as sequence,
        mm.created_date as creation_date,
        concat('Production') as particular,
        mm.mf_voucher_no as vch_no,
        'manufacturing' as vch_type,
        concat(${dispalyText}) as in_qty_display,
        '---' as out_qty_display,
        ifnull(mi.pd_qty,0) as in_qty,
        0 as out_qty

        from tbl_manufactured_items mi
        left join tbl_manufacturing_master mm on mm.mf_id = mi.mf_id
        where mi.status = 'a' 
        and mi.branch_id = ${req.user.user_branch_id} 
        and mi.item_id = ${payLoad.itemId}

        union select
        '6' as sequence,
        mm.created_date as creation_date,
        concat('Consume for Production') as particular,
        mm.mf_voucher_no as vch_no,
        'manufacturing' as vch_type,
       '---' as in_qty_display,
       concat(${` ${conversion > 1 ? ` raw_item_qty , ' ${item[0].unit_symbol} & ' , raw_retail_qty, ' ${item[0].base_unit_name}'` : `raw_item_qty , ' ${item[0].unit_symbol}'`} `}) as out_qty_display,
        0 as in_qty,
        ifnull(ci.raw_qty,0) as out_qty

        from tbl_manufacturing_consume_items ci
        left join tbl_manufacturing_master mm on mm.mf_id = ci.mf_id
        where ci.status = 'a' 
        and ci.branch_id = ${req.user.user_branch_id} 
        and ci.item_id = ${payLoad.itemId}

        union select
        '7' as sequence,
        tm.created_date as creation_date,
        concat('Transfer To ',b.branch_name) as particular,
        tm.t_voucher_no as vch_no,
        'Transfer' as vch_type,
       '---' as in_qty_display,
       concat(${dispalyText}) as out_qty_display,
        0 as in_qty,
        ifnull(td.t_qty,0) as out_qty

        from tbl_transfer_details td
        left join tbl_transfer_master tm on tm.t_id = td.t_id
        left join tbl_branches b on b.branch_id  = td.to_branch_id
        where td.status = 'a'
        and td.branch_id = ${req.user.user_branch_id} 
        and td.item_id = ${payLoad.itemId}

        union select
        '8' as sequence,
        tm.created_date as creation_date,
        concat('Received From ',b.branch_name) as particular,
        tm.t_voucher_no as vch_no,
        'Transfer' as vch_type,
        concat(${dispalyText}) as in_qty_display,
        '---' as out_qty_display,
        ifnull(td.t_qty,0) as in_qty,
        0 as out_qty

        from tbl_transfer_details td
        left join tbl_transfer_master tm on tm.t_id = td.t_id
        left join tbl_branches b on b.branch_id  = td.branch_id
        where td.status = 'a'
        and td.to_branch_id = ${req.user.user_branch_id} 
        and td.item_id = ${payLoad.itemId}


        union select
        '9' as sequence,
        adds.created_date as creation_date,
        'Damaged ' as particular,
        adds.adjust_voucher_no as vch_no,
        'Adjustment' as vch_type,
        concat(${dispalyText}) as in_qty_display,
        '---' as out_qty_display,
        0 as in_qty, 
        ifnull(ajd.adjust_qty,0) as out_qty 
        
        from tbl_adjustment_details ajd
        left join tbl_adjustment_master adds on adds.adjust_id = ajd.adjust_id
        where ajd.status = 'a' 
        and ajd.branch_id = ${req.user.user_branch_id} 
        and ajd.item_id = ${payLoad.itemId}



        union select
        '10' as sequence,
        adds.created_date as creation_date,
        concat(acc.acc_name) as particular,
        adds.voucher_no as vch_no,
        'Replace Return' as vch_type,
        concat(${` ${conversion > 1 ? ` return_item_qty , ' ${item[0].unit_symbol} & ' , return_retail_qty, ' ${item[0].base_unit_name}'` : `return_item_qty , ' ${item[0].unit_symbol}'`} `}) as in_qty_display,
        '---' as out_qty_display,
        0 as in_qty, 
        ifnull(ajd.return_qty,0) as out_qty 
        
        from tbl_replace_return_items ajd
        left join tbl_replace_master adds on adds.replace_id  = ajd.replace_id 
        left join tbl_accounts acc on acc.acc_id = adds.customer_id
        where ajd.status = 'a' 
        and ajd.branch_id = ${req.user.user_branch_id} 
        and ajd.item_id = ${payLoad.itemId}


        union select
        '11' as sequence,
        adds.created_date as creation_date,
        concat(acc.acc_name) as particular,
        adds.voucher_no as vch_no,
        'Replace Given' as vch_type,
        concat(${` ${conversion > 1 ? ` given_qty , ' ${item[0].unit_symbol} & ' , given_retail_qty, ' ${item[0].base_unit_name}'` : `item_qty , ' ${item[0].unit_symbol}'`} `}) as in_qty_display,
        '---' as out_qty_display,
        0 as in_qty, 
        ifnull(ajd.given_qty,0) as out_qty 
        
        from tbl_given_items ajd
        left join tbl_replace_master adds on adds.replace_id  = ajd.replace_id 
        left join tbl_accounts acc on acc.acc_id = adds.customer_id
        where ajd.status = 'a' 
        and ajd.branch_id = ${req.user.user_branch_id} 
        and ajd.item_id = ${payLoad.itemId}

        order by creation_date asc

    `).then(res=>res));

    if(expensesErr && !expenses){ return next(expensesErr)}

      
      // Get Opening Stock Qty
   
 
     let opening_qty  = item[0].opening_qty
     let closing_qty  = 0
     
 
     let newLedger = expenses.map((value,index) => {
         let lastQty  = index == 0 ? opening_qty : expenses[index - 1].current_qty;
         value.current_qty = ( parseFloat(lastQty) + parseFloat(value.in_qty) ) - parseFloat(value.out_qty);


         let qtyDiv = value.current_qty / item[0].conversion
         let floatingDiv = (qtyDiv + "").split(".");

         value.current_qty_display =  floatingDiv[0] +' '+ item[0].unit_symbol + (item[0].conversion >1 ? ', '+ (floatingDiv[1] == undefined ? 0 : floatingDiv[1]) +' ' +item[0].base_unit_name:'')


          
         return value;
     });
 
     
 
     if((dateFrom != undefined && dateTo != undefined) && (dateFrom != null && dateTo != null) && newLedger.length > 0){
         let prevTrans =  newLedger.filter((payment)=>{
              return payment.creation_date < dateFrom
          });
  
          opening_qty =  prevTrans.length > 0 ? prevTrans[prevTrans.length - 1].current_qty : opening_qty;

       

          
          newLedger =  newLedger.filter((payment)=>{
              return payment.creation_date >= dateFrom && payment.creation_date <= dateTo
          });
 
      }
  
 
         if(newLedger.length > 0){
            closing_qty = newLedger.length > 0 ? newLedger[newLedger.length - 1].current_qty : 0;
         }



         let qtyDiv = opening_qty / item[0].conversion
         let floatingDiv = (qtyDiv + "").split(".");
         let opening_qty_display =  opening_qty


          qtyDiv = closing_qty / item[0].conversion
          floatingDiv = (qtyDiv + "").split(".");
         let closing_qty_display =  closing_qty

 
      res.json({opening_qty_display,
             closing_qty_display,
             ledger:newLedger,
             });

 });



 router.post('/api/get-adjust-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

   
    if(para.userId != undefined && para.userId != null){
        cluases += ` and am.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and am.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   



    if(para.adjust_id != undefined && para.adjust_id != null &&  para.adjust_id != 0){
        cluases += ` and am.adjust_id = ${para.adjust_id} `
    }

  


    let [masterDataErr,masterData] =  await _p(db.query(`select am.*,u.user_full_name
            from tbl_adjustment_master am
            left join tbl_users u on u.user_id = am.created_by
            where  am.status = 'a'
            and am.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select ad.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,

            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol,
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name as warehouse_name
            
            from tbl_adjustment_details ad
            left join tbl_warehouses w on w.warehouse_id  = ad.warehouse_id
            left join tbl_items it on it.item_id = ad.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = ad.per_unit_id 

            where  ad.status = 'a'
            and ad.adjust_id = ? 
            `,[detail.adjust_id])).then(res=>{
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


    res.json(await  Promise.all(data));
});


router.post('/api/update-adjustment',async(req,res,next)=>{  
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        let para = req.body;
        let masterData = para.masterData;

        await Tran.update(`tbl_adjustment_master`,masterData,{adjust_id  : para.adjust_id },transaction)
    // Save Master Data - End

    // Old 
    let details = await Tran.selectByCond(`select * from tbl_adjustment_details where adjust_id=? and status='a'`,[para.adjust_id], transaction)

    for(item of details){
        
        await stockUpdate('damage_qty','minus',item.item_id,item.adjust_qty,item.branch_id,item.warehouse_id,transaction)
    }

    // End
    await Tran.delete(`tbl_adjustment_details`,{adjust_id : para.adjust_id},transaction)
    
    // Save Detail Data - Start
    for(item of para.itemCart){
            let cartData = {
                adjust_id: para.adjust_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
                per_unit_id: item.per_unit_id,
                warehouse_id: item.warehouse_id,
                item_qty: item.item_qty,
                item_rate: item.item_rate,
                item_total: item.item_total,
                adjust_qty: item.adjust_qty,
                adjust_rate: item.adjust_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                adjust_type : item.adjust_type,
                branch_id : req.user.user_branch_id
            }
            await Tran.create(`tbl_adjustment_details`,cartData,transaction)
            await stockUpdate('damage_qty','plus',item.item_id,item.adjust_qty,req.user.user_branch_id,item.warehouse_id,transaction)

        }
    
    await transaction.commit();
    res.json({error:false,message:'Adjustment  updated Successfully.',adjust_id: para.adjust_id});

    }catch (err) {
        await transaction.rollback();
        next(err);
       }
});


router.post('/api/get-adjustment-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

   
    if(para.userId != undefined && para.userId != null){
        cluases += ` and am.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and am.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

   

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and ad.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select ad.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            am.adjust_voucher_no,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name,
            w.warehouse_name

            from tbl_adjustment_details ad
            left join tbl_adjustment_master am on am.adjust_id  = ad.adjust_id
            left join tbl_warehouses w on w.warehouse_id  = ad.warehouse_id
            left join tbl_items it on it.item_id = ad.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  ad.status = 'a'
            and am.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });


    res.json(details);
});


router.post(`/api/adjustment-delete`,async(req,res,next)=>{
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();

    let para = req.body;
    await Tran.update(`tbl_adjustment_master`,{status:'d'},{adjust_id  : para.adjust_id },transaction)
  

    let details = await Tran.selectByCond(`select * from tbl_adjustment_details where adjust_id  = ? and status = 'a'`,[para.adjust_id], transaction)

    await Tran.update(`tbl_adjustment_details`,{status:'d'},{adjust_id  : para.adjust_id },transaction)

    for(item of details){
        let serials = [] 
        
        serials = item.serials.split(',');
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

        await stockUpdate('damage_qty','minus',item.item_id,item.adjust_qty,item.branch_id,item.warehouse_id,transaction)
     }

     
    await transaction.commit();
    res.json({error:false,message:'Adjustment  Deleted Successfully.'});

    }catch (err) {
        await transaction.rollback();
        next(err);
    }
});


router.post(`/api/get-serials`,async(req,res,next)=>{
    let para = req.body
    let [serialsErr,serials] =  await _p(db.query(` select serial_number from tbl_item_serials
     where item_id  = ${para.itemId} ${para.warehouseId != 0 ? ` and warehouse_id = ${para.warehouseId} `: ''}
     and branch_id = ${req.user.user_branch_id} and status = 'in' `)).then((row)=>{
        return row;
    });
    res.json(serials)
})

router.post(`/api/get-serials-outs`,async(req,res,next)=>{
    let para = req.body
    let [serialsErr,serials] =  await _p(db.query(` select serial_number from tbl_item_serials
     where item_id  = ${para.itemId} ${para.warehouseId != 0 ? ` and warehouse_id = ${para.warehouseId} `: ''}
     and branch_id = ${req.user.user_branch_id} and status = 'out' `)).then((row)=>{
        return row;
    });
    res.json(serials)
})




// SET FOREIGN_KEY_CHECKS = 0; 
// TRUNCATE table $table_name; 
// SET FOREIGN_KEY_CHECKS = 1;



router.get(`/api/get-s`,async(req,res,next)=>{
    let [productsError,products] =  await _p(db.query(`select p.prod_id,p.prod_code,p.prod_sale_rate,p.prod_sale_rate as prod_rate,p.prod_whole_sale_rate,u.prod_unit_id,
    c.prod_cat_name,c.prod_cat_id,concat(pn.prod_name,' - ',ifnull(p.prod_code,' ')) as prod_name,u.prod_unit_name
     from 
    tbl_products p 
    left join tbl_product_categories c on p.prod_cat_id = c.prod_cat_id
    left join tbl_products_names pn on p.prod_name_id = pn.prod_name_id
    left join tbl_product_units u on p.prod_unit_id = u.prod_unit_id
    
    where   
    p.prod_status='active' 

    order by  p.prod_id
     `)).then(result=>{
        return result;
    });
    res.json(products)
})





router.get(`/api/go-entry`,async(req,res,next)=>{
    let [productsError,products] =  await _p(db.query(`select p.prod_id,p.prod_code,p.prod_sale_rate,p.prod_sale_rate as prod_rate,p.prod_whole_sale_rate,u.prod_unit_id,
    c.prod_cat_name,c.prod_cat_id,concat(pn.prod_name,' - ',ifnull(p.prod_code,' ')) as prod_name,u.prod_unit_name
     from 
    tbl_products p 
    left join tbl_product_categories c on p.prod_cat_id = c.prod_cat_id
    left join tbl_products_names pn on p.prod_name_id = pn.prod_name_id
    left join tbl_product_units u on p.prod_unit_id = u.prod_unit_id
    
    where   
    p.prod_status='active' 

    order by  p.prod_id
     `)).then(result=>{
        return result;
    });



    products.forEach(async (item,ind) => {
    //     var catId = 0
    //     var unitId = 0


    //     let [existErr1,exist1] =  await _p(db.query(`select category_name  from tbl_categories where 
    //     status = 'a'  and category_name = ? `,[item.prod_cat_name])).then(result=>{
    //         return result;
    //     });



    //     console.log(exist1)




    //     let [existErr2,exist2] =  await _p(db.query(`select * from 
    //     tbl_item_units where unit_name =  "${item.prod_unit_name}"`)).then(res=>{
    //         return res;
    //     });


    // //   console.log(exist1)

    //     if(exist1.length < 1){

    //         let [catErr,cat] =   await _p(db.insert('tbl_categories',{
    //             category_name : item.prod_cat_name,
    //             branch_id : 1,
    //             create_by: 0
    //         })).then(res=>{
    //             return res;
    //         });

    //         catId = cat.insertId


    //     }else{
         

    //      catId = exist1[0].category_id
    
    //     }



    //     if(exist2.length < 1){
    //         let [unitErr,unit] =   await _p(db.insert('tbl_item_units',{
    //             unit_name : item.prod_unit_name,
    //             unit_symbol : item.prod_unit_name,
    //             unit_symbol : item.prod_unit_name,
    //             create_by : 0,
    //             branch_id : 1
    //         })).then(res=>{
    //             return res;
    //         });




    //         unitId = unit.insertId
    //     }else{
        
    //         unitId =   exist2[0].unit_id


    //     }

    

        


      await _p(db.insert('tbl_items',{
            category_id : 12061,
            unit_id : 10855,
            item_barcode : item.prod_code,
            item_code : item.prod_code,
            item_name : item.prod_name,
            sale_rate: item.prod_sale_rate,
            create_by : 0,
            branch_ids : 1,
            group_id:0
        })).then(res=>{
            return res;
        });

    });


  

    

  res.json(products)
})





router.get(`/api/go-entry-customer`,async(req,res,next)=>{
    let [productsError,products] =  await _p(db.query(`select * from

    tbl_customers 
    
    where   
    customer_status='active' 
    and customer_type != 'general'

     `)).then(result=>{
        return result;
    });



    products.forEach(async (item,ind) => {

        let [productsError,products] =  await _p(db.query(`select * from

        tbl_customers 
        
        where   
        customer_status='active' 
        and customer_type != 'general'
    
         `)).then(result=>{
            return result;
        });
    

      await _p(db.insert('tbl_accounts',{
        acc_name : item.customer_name,
        acc_code : item.customer_code,
        institution_name : item.customer_institution_name,
        address : item.customer_address,
        contact_no : item.customer_mobile_no,
        acc_type_id : 'debitor',
        acc_type_name : 'Customer',
        branch_id: req.user.user_branch_id
           
        })).then(res=>{
            return res;
        });

    });


  

    

  res.json(products)
})


router.post(`/api/convert-total-stock-to-current-stock`,async(req,res,next)=>{
    //  Auto Total Stock to Current Stock
    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        
        
        let branches = await Tran.selectByCond(`select * from tbl_branches where branch_status = ? `,['active'], transaction)

        for(branch of branches ){

        // If need Multiple Warehouse just change it, if no have warehouse so do pass 0
        let warehouseId = 0;
        let items =  await convertTotalStockToCurrentStock(branch.branch_id,warehouseId,transaction)

        for(item of items){

            let exists = await Tran.countRows(`select * from tbl_item_current_stock where item_id=? and branch_id=? and warehouse_id=?`,[item.item_id,branch.branch_id,warehouseId], transaction)
            if(exists == 0){
                await Tran.create(`tbl_item_current_stock`,{
                item_id: item.item_id,
                branch_id: branch.branch_id,
                warehouse_id: warehouseId
                },transaction)
            }

                
                let [data, _] =  await Tran.updateQuery(`update tbl_item_current_stock set 

                purchase_qty=purchase_qty+${item.purchase_qty},
                purchase_return_qty=purchase_return_qty+${item.purchase_return_qty},
                sale_qty=sale_qty+${item.sale_qty},
                sale_return_qty=sale_return_qty+${item.sale_return_qty},
                production_qty=production_qty+${item.production_qty},
                damage_qty=damage_qty+${item.damage_qty},
                consume_qty=consume_qty+${item.consume_qty},
                transfer_in_qty=transfer_in_qty+${item.transfer_in_qty},
                transfer_out_qty=transfer_out_qty+${item.transfer_out_qty}

                where item_id=? and branch_id=? and warehouse_id=? `,[item.item_id,branch.branch_id,warehouseId],transaction)

        }
        }

    await transaction.commit();

    res.json("done")

    }catch (err) {
    await transaction.rollback();
    next(err);
   }
})

module.exports = router;