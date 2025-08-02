const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {Transaction}   = require('../utils/TranDB');


const  {Database}   = require('../utils/Database');
const { exit } = require('process');
let    db = new Database();
let    Tran = new Transaction();


let getServiceVoucherNo = async (req,res,next)=>{
    let [serviceError,service] =  await _p(db.query(`select service_id   from 
    tbl_service_master order by service_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(serviceError){
        next(serviceError)
    }
    let serviceCode = '';
    if(service.length == 0){
        serviceCode = 'SV1';
    }else{
        serviceCode = 'SV'+(parseFloat(service[0].service_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(serviceCode)
    })
}


let getServiceExpenseVoucherNo = async (req,res,next)=>{
    let [serviceExError,service_expense] =  await _p(db.query(`select service_ex_id  from tbl_service_expense_master 
   
    order by service_ex_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(serviceExError){
        next(serviceExError)
    }
    let serviceExCode = '';
    if(service_expense.length == 0){
        serviceExCode = 'SE1';
    }else{
        serviceExCode = 'SE'+(parseFloat(service_expense[0].service_ex_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(serviceExCode)
    })
}

router.get('/api/get-service-voucher-no',async(req,res,next)=>{  
    res.json(await  getServiceVoucherNo(req,res,next));
});

router.get('/api/get-service-expense-voucher-no',async(req,res,next)=>{  
    res.json(await  getServiceExpenseVoucherNo(req,res,next));
});


router.post('/api/create-service',async(req,res,next)=>{  
let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
    let masterData = para.masterData;
    let customer = para.customer;


    // Create General customer or New customer - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a'`,[customer.acc_name,req.user.user_branch_id], transaction)
   
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Customer name already exists.`
            });
            return false
        }
        let customerData = {
            acc_name:customer.acc_name,
            acc_type_id:'debitor',
            acc_type_name:'Customer',
            acc_type_label:'Customer',
            institution_name:customer.institution_name,
            address:customer.address,
            contact_no:customer.contact_no,
            creation_date : masterData.creation_date,
            party_type: customer.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        let [cusEnty, _]  = await Tran.create(`tbl_accounts`,customerData,transaction)
     
        masterData.acc_id = cusEnty;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General customer or New customer - End

    // Save Master Data - Start
        masterData.service_voucher_no = await  getServiceVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  para.orderId;
        let [masterEnrty, _]  = await Tran.create(`tbl_service_master`,masterData,transaction)
    
    // Save Master Data - End

    // Save Transaction
     for(pay of para.payCart){
         let payData = {
            voucher_type : 'service',
            voucher_id   : masterEnrty,
            to_acc_id  : pay.to_acc_id,
            tran_amount  : pay.tran_amount,
            from_acc_id    : masterData.acc_id,
         }
         await Tran.create(`tbl_voucher_transactions`,payData,transaction)
     }
    // End Transaction

    // Save Detail Data - Start
        for(item of para.itemCart){
            let cartData = {
                service_id: masterEnrty,
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
                service_qty: item.service_qty,
                service_rate: item.service_rate,
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
                    status: 'out',
                    branch_id: req.user.user_branch_id,
                }
                await Tran.create(`tbl_item_serials`,serialData,transaction)
            }
            // Save Serial End - start
            await Tran.create(`tbl_service_details`,cartData,transaction)
        // Save Detail Data - End
        }

    await transaction.commit();

    res.json({error:false,message:'Service  created Successfully.',service_id: masterEnrty});

}
catch (err) {
    await transaction.rollback();
    next(err);
   }
});


router.post('/api/get-service-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and sm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.service_id != undefined && para.service_id != null &&  para.service_id != 0){
        cluases += ` and sm.service_id = ${para.service_id} `
    }

    if( para.service_o_id == null && para.from =='voucher'){
        cluases += `  order by sm.service_id desc limit 1 `
    }else{
        cluases += ` order by sm.service_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select sm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             service_acc.acc_name as services_acc_name
            from tbl_service_master sm
            left join tbl_accounts service_acc on service_acc.acc_id = sm.services_acc_id
            left join tbl_accounts acc on acc.acc_id = sm.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sm.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sm.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = sm.transport_acc_id
            left join tbl_users u on u.user_id = sm.created_by
            where  sm.status = 'a'
            and sm.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select sd.*,it.item_name,it.is_serial,u.unit_name,u.unit_id,u.base_unit_id,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            peru.unit_symbol as per_unit_symbol, 
            peru.conversion as per_conversion,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_service_details sd
            left join tbl_warehouses w on w.warehouse_id  = sd.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sd.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sd.tax_acc_id
            left join tbl_items it on it.item_id = sd.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = sd.per_unit_id 
            where  sd.status = 'a'
            and sd.service_id = ? 
            `,[detail.service_id])).then(res=>{
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
            where vt.voucher_type = 'service' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.service_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    });



    res.json(await  Promise.all(data));
});



router.post('/api/update-service',async(req,res,next)=>{  

let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
    let masterData = para.masterData;
    let customer = para.customer;

    // Create General customer or New customer - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a'`,[customer.acc_name,req.user.user_branch_id,customer.acc_id =='G'?'general':''], transaction)
   
        if(exists > 0 ){
            res.json({
                error:true,
                message:`Customer name already exists.`
            });
            return false
        }
        let customerData = {
            acc_name:customer.acc_name,
            acc_type_id:'debitor',
            acc_type_name:'Customer',
            acc_type_label:'Customer',
            institution_name:customer.institution_name,
            address:customer.address,
            contact_no:customer.contact_no,
            creation_date : masterData.creation_date,
            party_type: customer.acc_id =='G'?'general':'no',
            branch_id: req.user.user_branch_id,
            create_by: req.user.user_id,
        }
        
        let [cusEnty, _]  = await Tran.create(`tbl_accounts`,customerData,transaction)

        masterData.acc_id = cusEnty;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General customer or New customer - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  para.orderId

        await Tran.update(`tbl_service_master`,masterData,{service_id : para.service_id},transaction)
   
    // Save Master Data - End
    await Tran.delete(`tbl_voucher_transactions`,{voucher_id : para.service_id,voucher_type:'service',status:'a'},transaction)


      // Save Transaction
    for(pay of para.payCart){
        let payData = {
           voucher_type : 'service',
           voucher_id   : para.service_id,
           to_acc_id  : pay.to_acc_id,
           tran_amount  : pay.tran_amount,
           from_acc_id    : masterData.acc_id,
        }
        await Tran.create(`tbl_voucher_transactions`,payData,transaction)
    }
   // End Transaction
    // End
    await Tran.delete(`tbl_service_details`,{service_id : para.service_id},transaction)
    // Save Detail Data - Start
     for(item of para.itemCart){

            let cartData = {
                service_id: para.service_id,
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
                service_qty: item.service_qty,
                service_rate: item.service_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  para.orderId

            }
            await Tran.create(`tbl_service_details`,cartData,transaction)
            // Save Serial Data - start
        // Save Detail Data - End
        }
    
    await transaction.commit();
    res.json({error:false,message:'service  updated Successfully.',service_id: para.service_id});

}
catch (err) {
    await transaction.rollback();
    next(err);
   }
});

router.post(`/api/service-delete`,async(req,res,next)=>{
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;

     await Tran.update(`tbl_service_master`,{status:'d'},{service_id : para.service_id},transaction)

     await Tran.update(`tbl_voucher_transactions`,{status:'d'},{voucher_id : para.service_id,voucher_type:'service'},transaction)
   
     await Tran.update(`tbl_service_details`,{status:'d'},{service_id : para.service_id},transaction)
  

     await transaction.commit();
    res.json({error:false,message:'service  Deleted Successfully.'});
}
catch (err) {
    await transaction.rollback();
    next(err);
}
})

router.post('/api/get-service-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and sm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select sm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_service_master sm
            left join tbl_accounts acc on acc.acc_id = sm.acc_id
            left join tbl_users u on u.user_id = sm.created_by
            where  sm.status != 'd'  
            and sm.branch_id = ? 
            ${cluases}
           
            order by sm.service_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});


router.post('/api/get-service-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and sm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sd.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and sd.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select sd.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            sm.service_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_service_details sd
            left join tbl_service_master sm on sm.service_id  = sd.service_id
            left join tbl_accounts acc on acc.acc_id = sm.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = sd.warehouse_id
            left join tbl_items it on it.item_id = sd.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  sd.status = 'a'
            and sm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });

    res.json(details);
});


router.post(`/api/service-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  sm.service_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select sm.service_id,sm.service_voucher_no as display_text
     from tbl_service_master sm
     where  sm.branch_id = ? 
     ${cluases}
     and sm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
});



router.post('/api/create-service-expense',async(req,res,next)=>{  
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
        let [suppEnty, _]  = await Tran.create(`tbl_accounts`,supplierData,transaction)
        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = supplier.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.service_ex_voucher_no = await  getServiceExpenseVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  para.orderId;
        let [masterEnrty, _]  = await Tran.create(`tbl_service_expense_master`,masterData,transaction)
    // Save Master Data - End

    // If it order to service_expense
    if(req.body.orderId != 0){
       await Tran.update(`tbl_service_expense_order_master`,{status:'c'},{service_ex_o_id:req.body.orderId},transaction)
    }

    // Save Transaction
        for(pay of para.payCart){
         let payData = {
            voucher_type : 'service_expense',
            voucher_id   : masterEnrty,
            from_acc_id  : pay.from_acc_id,
            tran_amount  : pay.tran_amount,
            to_acc_id    : masterData.acc_id,
         }
        await Tran.create(`tbl_voucher_transactions`,payData,transaction)
     }
    // End Transaction

    // Save Detail Data - Start
        for(item of para.itemCart){
            let cartData = {
                service_ex_id: masterEnrty,
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
                service_ex_qty: item.service_ex_qty,
                service_ex_rate: item.service_ex_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id : para.orderId
            }
            await Tran.create(`tbl_service_expense_details`,cartData,transaction)
        }
    
    await transaction.commit();

    res.json({error:false,message:'Service Expense  created Successfully.',service_ex_id: masterEnrty});

}
catch (err) {
        await transaction.rollback();
        next(err);
}
});

router.post('/api/update-service-expense',async(req,res,next)=>{  

let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

        let para = req.body;
        let masterData = para.masterData;
        let supplier = para.supplier;
     
    // Create General Supplier or New Supplier - Start
    if(supplier.acc_id == 'G' || supplier.acc_id == 'N'){
        let exists = await Tran.selectByCond(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a' `,[supplier.acc_name,req.user.user_branch_id,supplier.acc_id =='G'?'general':''], transaction)
        
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

        await Tran.update(`tbl_service_expense_master`,masterData,{service_ex_id : para.service_ex_id},transaction)
    // Save Master Data - End

    await Tran.delete(`tbl_voucher_transactions`,{voucher_id : para.service_ex_id,voucher_type:'service_expense',status:'a'},transaction)

      // Save Transaction
    for(pay of para.payCart){
        let payData = {
           voucher_type : 'service_expense',
           voucher_id   : para.service_ex_id,
           from_acc_id  : pay.from_acc_id,
           tran_amount  : pay.tran_amount,
           to_acc_id    : masterData.acc_id,
        }
        await Tran.create(`tbl_voucher_transactions`,payData,transaction)
    }
   // End Transaction


    // End
    await Tran.delete(`tbl_service_expense_details`,{service_ex_id : para.service_ex_id},transaction)

    // Save Detail Data - Start
        for(item of para.itemCart){
            let cartData = {
                service_ex_id: para.service_ex_id,
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
                service_ex_qty: item.service_ex_qty,
                service_ex_rate: item.service_ex_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  para.orderId

            }
            await Tran.create(`tbl_service_expense_details`,cartData,transaction)
      
        // Save Detail Data - End
        }
    
    await transaction.commit();

    res.json({error:false,message:'Service Expense  updated Successfully.',service_ex_id: para.service_ex_id});

}
catch (err) {
        await transaction.rollback();
        next(err);
}
});


router.post('/api/get-service-expense-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and sem.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sem.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sem.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select sem.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_service_expense_master sem
            left join tbl_accounts acc on acc.acc_id = sem.acc_id
            left join tbl_users u on u.user_id = sem.created_by
            where  sem.status != 'd'  
            and sem.branch_id = ? 
            ${cluases}
           
            order by sem.service_ex_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});



router.post('/api/get-service-expense-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and sem.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sem.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sed.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and sed.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select sed.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            sem.service_ex_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_service_expense_details sed
            left join tbl_service_expense_master sem on sem.service_ex_id  = sed.service_ex_id
            left join tbl_accounts acc on acc.acc_id = sem.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = sed.warehouse_id
            left join tbl_items it on it.item_id = sed.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  sed.status = 'a'
            and sem.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });

    res.json(details);
});


router.post(`/api/service-expense-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  sem.service_ex_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select sem.service_ex_id,sem.service_ex_voucher_no as display_text
     from tbl_service_expense_master sem
     where  sem.branch_id = ? 
     ${cluases}
     and sem.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
})



router.post('/api/get-service-expense-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.supplierId != undefined && para.supplierId != null){
        cluases += ` and sem.acc_id = ${para.supplierId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sem.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sem.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.service_ex_id != undefined && para.service_ex_id != null &&  para.service_ex_id != 0){
        cluases += ` and sem.service_ex_id = ${para.service_ex_id} `
    }

    if( para.service_ex_o_id == null && para.from =='voucher'){
        cluases += `  order by sem.service_ex_id desc limit 1 `
    }else{
        cluases += ` order by sem.service_ex_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select sem.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             accex.acc_name as service_ex_acc_name
            from tbl_service_expense_master sem
            left join tbl_accounts accex on accex.acc_id = sem.service_ex_acc_id
            left join tbl_accounts acc on acc.acc_id = sem.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sem.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sem.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = sem.transport_acc_id
            left join tbl_users u on u.user_id = sem.created_by
            where  sem.status = 'a'
            and sem.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select sed.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol, 
            peru.conversion as per_conversion,
            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_service_expense_details sed
            left join tbl_warehouses w on w.warehouse_id  = sed.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sed.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sed.tax_acc_id
            left join tbl_items it on it.item_id = sed.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = sed.per_unit_id 

            where  sed.status = 'a'
            and sed.service_ex_id = ? 
            `,[detail.service_ex_id])).then(res=>{
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
            where vt.voucher_type = 'service_expense' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.service_ex_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    })



    res.json(await  Promise.all(data));
});


router.post(`/api/service-expense-delete`,async(req,res,next)=>{

let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;

    await Tran.update(`tbl_service_expense_master`,{status:'d'},{service_ex_id : para.service_ex_id},transaction)
    await Tran.update(`tbl_voucher_transactions`,{status:'d'},{voucher_id : para.service_ex_id,voucher_type:'service_expense'},transaction)
    
    await Tran.update(`tbl_service_expense_details`,{status:'d'},{service_ex_id : para.service_ex_id},transaction)

    await transaction.commit();

    res.json({error:false,message:'Service Expense  deleted Successfully.'});

}
catch (err) {
        await transaction.rollback();
        next(err);
}

})


module.exports = router;