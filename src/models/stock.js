const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate,formatBigNumber} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const  {Transaction}   = require('../utils/TranDB');
const BigNumber = require('bignumber.js');
const { exit } = require('process');
let    db = new Database();
let    Tran = new Transaction();


let stockUpdate = async  (columnName,action,itemId,qty,branchId,warehouseId,transaction)=>{
        let exists = await Tran.countRows(`select * from tbl_item_current_stock where item_id=? and branch_id=? and warehouse_id=?`,[itemId,branchId,warehouseId], transaction)
       
        if(exists == 0){
            await Tran.create(`tbl_item_current_stock`,{
            item_id: itemId,
            branch_id: branchId,
            warehouse_id: warehouseId
            },transaction)
        }

        let   [data, _] =  await Tran.updateQuery(`update tbl_item_current_stock set ${columnName}=${columnName}${action=='plus'?'+':'-'}${qty} 
               where item_id=? and branch_id=? and warehouse_id=? `,[itemId,branchId,warehouseId],transaction)
        return data;
}

let itemCostUpdate = async  (action,itemId,currQty,currRate,prevStock,branchId,warehouseId,transaction)=>{
             /// Product Avarage Calculation
            // purchase rate entry check 
            let getAvgRate = await Tran.selectByCond(`select ifnull(average_rate,0) as average_rate from 
            tbl_item_average_rate  where item_id=? and branch_id=? and warehouse_id = ? `,[itemId,branchId,warehouseId], transaction)
         
             let previousAvgRate =  BigNumber(getAvgRate.length == 0?'0':getAvgRate[0].average_rate);
              // previous stock value
              let  previousStockValue =  prevStock != 0 ? previousAvgRate.multipliedBy(prevStock) : BigNumber(0);
              //End

              let itemAverageRate = 0;
              if(action == 'plus'){
                    // This Current stock value
                    let creatingStockValue = currQty * currRate;

                    // Total Qty previous and in operation
                    let totalQty = prevStock + parseFloat(currQty);
                    
                    // Getting current stock value
                    let totalStockValue =  previousStockValue.plus(creatingStockValue) 
                 

                    if(totalStockValue == 0 ){
                        itemAverageRate = 0
                    }else{
                        itemAverageRate = totalQty != 0 ? totalStockValue.dividedBy(totalQty) : totalStockValue;
                    }

               }

               if(action == 'minus'){
                    // This deduction stock value
                    let deductionValue = currQty * currRate;

                    // Total Qty previous and in operation will be minus for deduction
                    let totalQty = prevStock - currQty

                    // Getting current stock value
                    let totalStockValue = previousStockValue.minus(deductionValue) 
        
                    if(totalStockValue == 0){
                        itemAverageRate = 0
                    }else{
                        itemAverageRate = totalQty != 0 ? totalStockValue.dividedBy(totalQty) : totalStockValue;
                    }
               }

              let savePayload = {
                item_id: itemId,
                branch_id: branchId,
                warehouse_id: warehouseId,
                average_rate: `${itemAverageRate}`,
              }

             if(getAvgRate.length == 0){
                var [data,_] = await Tran.create(`tbl_item_average_rate`,savePayload,transaction)
           
             }else{
                var [data,_] = await Tran.update(`tbl_item_average_rate`,{average_rate : `${itemAverageRate}`},{item_id : itemId, branch_id: branchId,warehouse_id : warehouseId},transaction)
            }
            return data;
}


let getStock = async (req,res,next,itemId,type = 'none',branchId,warehouseId,transaction)=>{
    let cluases = ``
    let headCluases = ` `

    if(itemId != 0){
        cluases += ` and item.item_id = ${itemId} `
    }

    if(type != ''){
        
            if(warehouseId != undefined && warehouseId != null ){
                warehouseId = warehouseId
            }else{
                warehouseId = 0
            }

            if(req.body.groupId != undefined && req.body.groupId != null ){
                cluases += ` and item.group_id = ${req.body.groupId} `
            }

            if(req.body.categoryId != undefined && req.body.categoryId != null ){
                cluases += ` and item.category_id = ${req.body.categoryId} `
            }

            let dateCluases = ''
            if(req.body.fromDate != undefined && req.body.toDate != undefined){
                dateCluases +=  ` between "${req.body.fromDate}" and "${req.body.toDate}" `
            }


            if(type == 'all' || type == 'current_stock'){
                headCluases += ` item.item_name,w.warehouse_name,item.item_code,item.is_serial, g.group_name,c.category_name,ifnull(unit.conversion,1) as conversion,unit.unit_symbol,
                (
                select unit_symbol  from tbl_item_units iu   where iu.unit_id = unit.base_unit_id
                ) as base_unit_name,`
            }
    }


    let sql = ` select item.item_id,ifnull(avg_rate.average_rate,0)  as average_rate, ${headCluases}
    stock.*,
    (
        select stock.opening_qty + stock.purchase_qty + stock.production_qty + stock.sale_return_qty + stock.transfer_in_qty + replace_return_qty
    ) as in_quantity,
    (
        select stock.sale_qty + stock.purchase_return_qty + stock.damage_qty + stock.consume_qty + stock.transfer_out_qty + replace_given_qty
    ) as out_quantity,
    (
        select round(in_quantity - out_quantity,4)
    ) as current_qty,
    (
       select  ifnull(average_rate * current_qty,0)
    ) as stock_value 
    
    
    from  tbl_item_current_stock stock 
    left join tbl_items item on item.item_id = stock.item_id
    left join tbl_item_units unit on unit.unit_id = item.unit_id
    left join tbl_warehouses w on w.warehouse_id = stock.warehouse_id   
    left join tbl_groups g on g.group_id = item.group_id   
    left join tbl_categories c on c.category_id = item.category_id
    left join tbl_item_average_rate avg_rate on 
              avg_rate.item_id = stock.item_id 
              and avg_rate.branch_id = stock.branch_id 
              and avg_rate.warehouse_id = stock.warehouse_id 

    where item.status = 'a'
    and stock.branch_id =  ${branchId}   
    ${warehouseId != 0 ? ` and stock.warehouse_id = ${warehouseId} `: ''}

    ${cluases}  `

    let stock;
    if(transaction == undefined){
        let [_,data] = await _p(db.query(sql)).then(res=>{
            return res;
        });
        stock = data

    }else{
         stock = await Tran.select(sql, transaction)
    }

 


    if(type == 'all' || type == 'current_stock'){
        stock =  stock.map((item)=>{
            let qtyDiv = item.current_qty / item.conversion
             let floatingDiv = (qtyDiv + "").split(".");
             let masterQty =  floatingDiv[0] * item.conversion
              let retailQty  = item.current_qty - masterQty
              if(item.conversion == 1){
                 floatingDiv = (formatBigNumber(item.current_qty,2) + "").split(".");
                 if(floatingDiv[1] == 0){
                    item.display_qty  =   floatingDiv[0]  +' '+ item.unit_symbol 
                 }else{
                    item.display_qty  =   formatBigNumber(item.current_qty,2)  +' '+ item.unit_symbol 
                 }

              }else{
                item.display_qty  = floatingDiv[0] +' '+ item.unit_symbol + (item.conversion >1 ? ', '+ (floatingDiv[1] == undefined ? 0 : retailQty) +' ' +item.base_unit_name:'')
              }
            return item
        })
    }

    stock =  stock.length == 0 && type != undefined && ( type == 'current_stock' || type =='' )? [
        {
            current_qty : 0,
            rate : 0,
            display_qty : 0,
          }
    ] : stock


    return stock;
}

let getDetailStock = async (req,res,next,itemId,type = 'none',branchId,warehouseId,transaction)=>{
    let cluases = ``
    if(itemId != 0){
        cluases += ` and item.item_id = ${itemId} `
    }

    if(warehouseId != undefined && warehouseId != null ){
        warehouseId = warehouseId
    }else{
        warehouseId = 0
    }

    if(req.body.groupId != undefined && req.body.groupId != null ){
        cluases += ` and item.group_id = ${req.body.groupId} `
    }

    if(req.body.categoryId != undefined && req.body.categoryId != null ){
        cluases += ` and item.category_id = ${req.body.categoryId} `
    }

    let dateCluases = ''
    if(req.body.fromDate != undefined && req.body.toDate != undefined){
        dateCluases +=  ` between "${req.body.fromDate}" and "${req.body.toDate}" `
    }

    let headCluases = ` `

    if(type == 'all'){
        headCluases += ` item.item_name,item.is_serial, g.group_name,c.category_name,ifnull(unit.conversion,1) as conversion,unit.unit_symbol,
        (
        select unit_symbol  from tbl_item_units iu   where iu.unit_id = unit.base_unit_id
        ) as base_unit_name,`
    }


        let sql =  `select item.item_id,item.opening_qty,item.item_code,ifnull(avg_rate.average_rate,0)  as average_rate, ${headCluases}
        (
            select ifnull(sum(pd.pur_qty),0) as purchase_qty from tbl_purchase_details pd 
            where pd.item_id = item.item_id 
            and pd.status ='a' and pd.branch_id = ${branchId}
            ${warehouseId != 0 ? ` and pd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and pd.created_date  ${dateCluases}` : ''}
        ) as purchase_qty,
        (
            select ifnull(sum(prd.pur_r_qty),0) as purchase_return_qty from tbl_purchase_return_details prd 
            where prd.item_id = item.item_id 
            and prd.status ='a' and prd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and prd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and prd.created_date  ${dateCluases}` : ''}
        ) as purchase_return_qty,
        (
            select ifnull(sum(sd.sale_qty),0) as sale_qty from tbl_sales_details sd 
            where sd.item_id = item.item_id 
            and sd.status ='a' and sd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and sd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and sd.created_date  ${dateCluases}` : ''}
        ) as sale_qty,
            (
            select ifnull(sum(srd.sale_r_qty),0) as sale_return_qty from tbl_sales_return_details srd 
            where srd.item_id = item.item_id 
            and srd.status ='a' and srd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and srd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and srd.created_date  ${dateCluases}` : ''}
        ) as sale_return_qty,
        
        (
            select ifnull(sum(mi.pd_qty),0) as production_qty from tbl_manufactured_items mi 
            where mi.item_id = item.item_id 
            and mi.status ='a' and mi.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and mi.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and mi.created_date  ${dateCluases}` : ''}
        ) as production_qty,
        (
            select ifnull(sum(coni.raw_qty),0) as consume_qty from tbl_manufacturing_consume_items coni 
            where coni.item_id = item.item_id 
            and coni.status ='a' and coni.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and coni.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and coni.created_date  ${dateCluases}` : ''}
        ) as consume_qty,
        
        (
            select ifnull(sum(tf.t_qty),0) as transfer_in_qty from tbl_transfer_details tf 
            where tf.item_id = item.item_id 
            and tf.status ='a' and tf.to_branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and tf.to_warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and tf.created_date  ${dateCluases}` : ''}
            
        ) as transfer_in_qty,
            (
            select ifnull(sum(tf.t_qty),0) as transfer_out_qty from tbl_transfer_details tf 
            where tf.item_id = item.item_id 
            ${warehouseId != 0 ? ` and tf.from_warehouse_id = ${warehouseId} `: ''}
            and tf.status ='a' 
            ${dateCluases != '' ? ` and tf.created_date  ${dateCluases}` : ''}
            and tf.branch_id =  ${branchId}
        ) as transfer_out_qty,
            
        (
          select  ifnull(sum(ad.adjust_qty),0) as damage_qty  
          from tbl_adjustment_details ad 
          where item.item_id = ad.item_id
          and ad.branch_id = ${branchId} 
          and ad.status = 'a'
          and ad.adjust_type = 'damage_stock'
          ${warehouseId != 0 ? ` and ad.warehouse_id = ${warehouseId} `: ''}
          ${dateCluases != '' ? ` and ad.created_date  ${dateCluases}` : ''}
        ) as damage_qty,
        
        (
            select  item.opening_qty + purchase_qty + sale_return_qty + production_qty + transfer_in_qty
        ) as in_quantity,
            (
            select purchase_return_qty + sale_qty + consume_qty + transfer_out_qty + damage_qty
            ) as out_quantity,
            (
                select in_quantity - out_quantity
            ) as current_qty,
            (
               select  ifnull(average_rate * current_qty,0)
            ) as stock_value 
            
            
            from  tbl_items item
            left join tbl_item_units unit on unit.unit_id = item.unit_id
            left join tbl_groups g on g.group_id = item.group_id   
            left join tbl_categories c on c.category_id = item.category_id
            left join tbl_item_average_rate avg_rate on avg_rate.item_id = item.item_id and avg_rate.branch_id = ${branchId} 
    
    
            where item.status = 'a'
            and find_in_set(${branchId},item.branch_ids)    
    
            ${cluases}`

        let stock;
        if(transaction == undefined){
            let [_,data] = await _p(db.query(sql)).then(res=>{
                return res;
            });
            stock = data
    
        }else{
             stock = await Tran.select(sql, transaction)
        }
     

    if(type == 'all'){
        stock =  stock.map((item)=>{
            let qtyDiv = item.current_qty / item.conversion
             let floatingDiv = (qtyDiv + "").split(".");
             let masterQty =  floatingDiv[0] * item.conversion
              let retailQty  = item.current_qty - masterQty
              if(item.conversion == 1){
                 floatingDiv = (formatBigNumber(item.current_qty,2) + "").split(".");
                 if(floatingDiv[1] == 0){
                    item.display_qty  =   floatingDiv[0]  +' '+ item.unit_symbol 
                 }else{
                    item.display_qty  =   formatBigNumber(item.current_qty,2)  +' '+ item.unit_symbol 
                 }

              }else{
                item.display_qty  = floatingDiv[0] +' '+ item.unit_symbol + (item.conversion >1 ? ', '+ (floatingDiv[1] == undefined ? 0 : retailQty) +' ' +item.base_unit_name:'')
              }
            return item
        })
    }

    stock =  stock.length == 0  ? [
        {
            current_qty : 0,
            rate : 0,
            display_qty : 0,
          }
    ] : stock
    return stock;
}

let convertTotalStockToCurrentStock = async (branchId,warehouseId,transaction)=>{
    let cluases = ``
    let dateCluases = ``
    let headCluases = ` `

        headCluases += ` item.item_name,item.opening_qty,item.is_serial, g.group_name,c.category_name,ifnull(unit.conversion,1) as conversion,unit.unit_symbol,
        (
        select unit_symbol  from tbl_item_units iu   where iu.unit_id = unit.base_unit_id
        ) as base_unit_name,`
    

        let sql =  `select item.item_id,item.item_code,ifnull(avg_rate.average_rate,0)  as average_rate, ${headCluases}
        (
            select ifnull(sum(pd.pur_qty),0) as purchase_qty from tbl_purchase_details pd 
            where pd.item_id = item.item_id 
            and pd.status ='a' and pd.branch_id = ${branchId}
            ${warehouseId != 0 ? ` and pd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and pd.created_date  ${dateCluases}` : ''}
        ) as purchase_qty,
        (
            select ifnull(sum(prd.pur_r_qty),0) as purchase_return_qty from tbl_purchase_return_details prd 
            where prd.item_id = item.item_id 
            and prd.status ='a' and prd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and prd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and prd.created_date  ${dateCluases}` : ''}
        ) as purchase_return_qty,
        (
            select ifnull(sum(sd.sale_qty),0) as sale_qty from tbl_sales_details sd 
            where sd.item_id = item.item_id 
            and sd.status ='a' and sd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and sd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and sd.created_date  ${dateCluases}` : ''}
        ) as sale_qty,
            (
            select ifnull(sum(srd.sale_r_qty),0) as sale_return_qty from tbl_sales_return_details srd 
            where srd.item_id = item.item_id 
            and srd.status ='a' and srd.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and srd.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and srd.created_date  ${dateCluases}` : ''}
        ) as sale_return_qty,
        
        (
            select ifnull(sum(mi.pd_qty),0) as production_qty from tbl_manufactured_items mi 
            where mi.item_id = item.item_id 
            and mi.status ='a' and mi.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and mi.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and mi.created_date  ${dateCluases}` : ''}
        ) as production_qty,
        (
            select ifnull(sum(coni.raw_qty),0) as consume_qty from tbl_manufacturing_consume_items coni 
            where coni.item_id = item.item_id 
            and coni.status ='a' and coni.branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and coni.warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and coni.created_date  ${dateCluases}` : ''}
        ) as consume_qty,
        
        (
            select ifnull(sum(tf.t_qty),0) as transfer_in_qty from tbl_transfer_details tf 
            where tf.item_id = item.item_id 
            and tf.status ='a' and tf.to_branch_id =  ${branchId}
            ${warehouseId != 0 ? ` and tf.to_warehouse_id = ${warehouseId} `: ''}
            ${dateCluases != '' ? ` and tf.created_date  ${dateCluases}` : ''}
            
        ) as transfer_in_qty,
            (
            select ifnull(sum(tf.t_qty),0) as transfer_out_qty from tbl_transfer_details tf 
            where tf.item_id = item.item_id 
            ${warehouseId != 0 ? ` and tf.from_warehouse_id = ${warehouseId} `: ''}
            and tf.status ='a' 
            ${dateCluases != '' ? ` and tf.created_date  ${dateCluases}` : ''}
            and tf.branch_id =  ${branchId}
        ) as transfer_out_qty,
            
        (
          select  ifnull(sum(ad.adjust_qty),0) as damage_qty  
          from tbl_adjustment_details ad 
          where item.item_id = ad.item_id
          and ad.branch_id = ${branchId} 
          and ad.status = 'a'
          and ad.adjust_type = 'damage_stock'
          ${warehouseId != 0 ? ` and ad.warehouse_id = ${warehouseId} `: ''}
          ${dateCluases != '' ? ` and ad.created_date  ${dateCluases}` : ''}
        ) as damage_qty,
        
        (
            select  item.opening_qty + purchase_qty + sale_return_qty + production_qty + transfer_in_qty
        ) as in_quantity,
            (
            select purchase_return_qty + sale_qty + consume_qty + transfer_out_qty + damage_qty
            ) as out_quantity,
            (
                select in_quantity - out_quantity
            ) as current_qty,
            (
               select  ifnull(average_rate * current_qty,0)
            ) as stock_value 
            
            
            from  tbl_items item
            left join tbl_item_units unit on unit.unit_id = item.unit_id
            left join tbl_groups g on g.group_id = item.group_id   
            left join tbl_categories c on c.category_id = item.category_id
            left join tbl_item_average_rate avg_rate on avg_rate.item_id = item.item_id and avg_rate.branch_id = ${branchId} 
    
    
            where item.status = 'a'
            and find_in_set(${branchId},item.branch_ids)    
            ${cluases} `

            stock = await Tran.select(sql, transaction)

    

        stock =  stock.map((item)=>{
            let qtyDiv = item.current_qty / item.conversion
             let floatingDiv = (qtyDiv + "").split(".");
             let masterQty =  floatingDiv[0] * item.conversion
              let retailQty  = item.current_qty - masterQty
            item.display_qty  = floatingDiv[0] +' '+ item.unit_symbol + (item.conversion >1 ? ', '+ (floatingDiv[1] == undefined ? 0 : retailQty) +' ' +item.base_unit_name:'')
            return item
        })
    


    return stock;
}

module.exports = {getStock,getDetailStock,convertTotalStockToCurrentStock,stockUpdate,itemCostUpdate}