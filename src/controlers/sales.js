const router = require('express').Router();
const {check} = require('express-validator');
const  rejet_invalid = require("../middlewares/reject_invalid");
const _p      = require('../utils/promise_error');
const path    = require('path')
const fs = require('fs')
const BigNumber = require('bignumber.js');
const  {getCurrentISODT,checkIntNum,convToISODT,isoFromDate} = require('../utils/functions')
const  {Database}   = require('../utils/Database');
const  {stockUpdate,getStock,itemCostUpdate}   = require('../models/stock');

const { exit } = require('process');
const  {Transaction}   = require('../utils/TranDB');
const FormData = require('form-data');
// const axios = require('axios')


let    db = new Database();
let    Tran = new Transaction();


let getSalesOrderInv = async (req,res,next)=>{
    let [saleError,sale] =  await _p(db.query(`select sale_o_id  from tbl_sales_order_master  order by sale_o_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(saleError){
        next(saleError)
    }
    let saleCode = '';
    if(sale.length == 0){
        saleCode = 'SO1';
    }else{
        saleCode = 'SO'+(parseFloat(sale[0].sale_o_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(saleCode)
    })
}

let getSalesQuotationInv = async (req,res,next)=>{
    let [saleError,sale] =  await _p(db.query(`select sale_o_id  from 
    tbl_sales_quotation_master    order by sale_o_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(saleError){
        next(saleError)
    }
    let saleCode = '';
    if(sale.length == 0){
        saleCode = 'QO1';
    }else{
        saleCode = 'QO'+(parseFloat(sale[0].sale_o_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(saleCode)
    })
}

let getSaleVoucherNo = async (req,res,next)=>{
    let [saleError,sale] =  await _p(db.query(`select sale_id  from tbl_sales_master   order by sale_id  desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(saleError){
        next(saleError)
    }
    let saleCode = '';
    if(sale.length == 0){
        saleCode = 'INV-1';
    }else{
        saleCode = 'INV-'+(parseFloat(sale[0].sale_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(saleCode)
    })
}

router.get('/api/get-sales-voucher-no',async(req,res,next)=>{  
    res.json(await  getSaleVoucherNo(req,res,next));
});



router.post(`/api/sales-return-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  srm.sale_r_voucher_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select srm.sale_r_id,srm.sale_r_voucher_no as display_text
     from tbl_sales_return_master srm
     where  srm.branch_id = ? 
     ${cluases}
     and srm.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
})

let getSaleReturnVoucherNo = async (req,res,next)=>{
    let [saleError,sale] =  await _p(db.query(`select sale_r_id   from tbl_sales_return_master   order by sale_r_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(saleError){
        next(saleError)
    }
    let saleCode = '';
    if(sale.length<1){
        saleCode = 'SR1';
    }else{
        saleCode = 'SR'+(parseFloat(sale[0].sale_r_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(saleCode)
    })
}

router.get('/api/get-sales-return-voucher-no',async(req,res,next)=>{  
    res.json(await  getSaleReturnVoucherNo(req,res,next));
});

router.post('/api/get-sales-order-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select som.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_sales_order_master som
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_users u on u.user_id = som.created_by
            where  som.status != 'd'  
            and som.branch_id = ? 
            ${cluases}
           
            order by som.sale_o_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});

router.post('/api/get-sales-quotation-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select som.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_sales_quotation_master  som
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_users u on u.user_id = som.created_by
            where  som.status != 'd'  
            and som.branch_id = ? 
            ${cluases}
           
            order by som.sale_o_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});


router.get('/api/get-sales-order-invoice',async(req,res,next)=>{  
    res.json(await  getSalesOrderInv(req,res,next));
});

router.get('/api/get-sales-quotation-invoice',async(req,res,next)=>{  
    res.json(await  getSalesQuotationInv(req,res,next));
});

router.post('/api/create-sales-order',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let customer = para.customer;
    // Create General Supplier or New Supplier - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
       
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a' `,[customer.acc_name,req.user.user_branch_id])).then(res=>{
            return res;
        });
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
        let [cusEntyErr,cusEnty] =  await _p(db.insert('tbl_accounts',customerData)).then((row)=>{
            return row;
        })
        masterData.acc_id = cusEnty.insertId;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.sale_order_no = await  getSalesOrderInv(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.insert('tbl_sales_order_master',masterData)).then((row)=>{
            return row;
        });

    // Save Master Data - End

    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                sale_o_id: masterEnrty.insertId,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_sales_order_details',cartData)).then((row)=>{
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
    

    res.json({error:false,message:' order created Successfully.',sale_o_id: masterEnrty.insertId});
});

router.post('/api/create-sales-quotation',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let customer = para.customer;
    // Create General Supplier or New Supplier - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
       
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general'  and status = 'a' `,[customer.acc_name,req.user.user_branch_id])).then(res=>{
            return res;
        });
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
        let [cusEntyErr,cusEnty] =  await _p(db.insert('tbl_accounts',customerData)).then((row)=>{
            return row;
        })
        masterData.acc_id = cusEnty.insertId;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.sale_order_no = await  getSalesQuotationInv(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.insert('tbl_sales_quotation_master',masterData)).then((row)=>{
            return row;
        });

    // Save Master Data - End

    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                sale_o_id: masterEnrty.insertId,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_sales_quotation_details',cartData)).then((row)=>{
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
    

    res.json({error:false,message:' Quotation created Successfully.',sale_o_id: masterEnrty.insertId});
});


router.post('/api/get-sales-quotation-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.sale_o_id != undefined && para.sale_o_id != null &&  para.sale_o_id != 0){
        cluases += ` and som.sale_o_id = ${para.sale_o_id} `
    }

    if( para.sale_o_id == null && para.from =='voucher'){
        cluases += `  order by som.sale_o_id desc limit 1 `
    }else{
        cluases += ` order by som.sale_o_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select som.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_sales_quotation_master  som
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = som.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = som.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = som.transport_acc_id
            left join tbl_users u on u.user_id = som.created_by
            where  som.status != 'd' 
            and som.branch_id = ?  
            ${cluases}
           
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{ 
        let [itemDataErr,itemData] =  await _p(db.query(`select sod.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol, 
            peru.conversion as per_conversion,
            pr.average_rate as purchase_average_rate,

            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_sales_quotation_details  sod
            left join tbl_warehouses w on w.warehouse_id  = sod.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sod.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sod.tax_acc_id
            left join tbl_items it on it.item_id = sod.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = sod.per_unit_id 

            left join tbl_item_average_rate pr on pr.item_id =  sod.item_id and pr.branch_id = sod.branch_id
            
            where  sod.status != 'd'  
            and sod.sale_o_id = ? 
            `,[detail.sale_o_id])).then(res=>{
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


        //   itemData =  itemData.map(async(item)=>{
        //       let [saleDataErr,saleData] =  await _p(db.query(` select ifnull(sum(item_qty),0) as done_item_qty,
        //               ifnull(sum(retail_qty),0) as done_retail_qty,ifnull(sum(sale_qty),0) as done_sale_qty
        //                 from  tbl_sales_details 
        //                 where order_id = ? and item_id = ? and status='a'
        //               `,[item.sale_o_id,item.item_id]).then(res=>{
        //                   return res
        //               }));

        //             item.done_item_qty =   saleData.length != 0? saleData[0].done_item_qty : 0;
        //             item.done_retail_qty =   saleData.length != 0? saleData[0].done_retail_qty : 0;
        //             item.done_sale_qty =   saleData.length != 0? saleData[0].done_sale_qty : 0;

        //             return item;
        //    });

           


    detail.details = await  Promise.all(itemData)
    return detail;
    });

  
  

    res.json(await  Promise.all(data) );
});

router.post('/api/get-sales-order-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.sale_o_id != undefined && para.sale_o_id != null &&  para.sale_o_id != 0){
        cluases += ` and som.sale_o_id = ${para.sale_o_id} `
    }

    if( para.sale_o_id == null && para.from =='voucher'){
        cluases += `  order by som.sale_o_id desc limit 1 `
    }else{
        cluases += ` order by som.sale_o_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select som.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name
            from tbl_sales_order_master som
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = som.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = som.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = som.transport_acc_id
            left join tbl_users u on u.user_id = som.created_by
            where  som.status != 'd' 
            and som.branch_id = ?  
            ${cluases}
           
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{ 
        let [itemDataErr,itemData] =  await _p(db.query(`select sod.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            u.unit_id,u.base_unit_id,
            peru.unit_symbol as per_unit_symbol, 
            peru.conversion as per_conversion,
            pr.average_rate as purchase_average_rate,

            concat(it.item_name,' - ',it.item_barcode) as display_text,
            w.warehouse_name,
            discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name

            from tbl_sales_order_details sod
            left join tbl_warehouses w on w.warehouse_id  = sod.warehouse_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sod.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sod.tax_acc_id
            left join tbl_items it on it.item_id = sod.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = sod.per_unit_id 

            left join tbl_item_average_rate pr on pr.item_id =  sod.item_id and pr.branch_id = sod.branch_id
            
            where  sod.status != 'd'  
            and sod.sale_o_id = ? 
            `,[detail.sale_o_id])).then(res=>{
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
              let [saleDataErr,saleData] =  await _p(db.query(` select ifnull(sum(item_qty),0) as done_item_qty,
                      ifnull(sum(retail_qty),0) as done_retail_qty,ifnull(sum(sale_qty),0) as done_sale_qty
                        from  tbl_sales_details 
                        where order_id = ? and item_id = ? and status='a'
                      `,[item.sale_o_id,item.item_id]).then(res=>{
                          return res
                      }));

                    item.done_item_qty =   saleData.length != 0? saleData[0].done_item_qty : 0;
                    item.done_retail_qty =   saleData.length != 0? saleData[0].done_retail_qty : 0;
                    item.done_sale_qty =   saleData.length != 0? saleData[0].done_sale_qty : 0;

                    return item;
           });

           


    detail.details = await  Promise.all(itemData)
    return detail;
    });

  
  

    res.json(await  Promise.all(data) );
});


router.post('/api/update-sales-order',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let customer = para.customer;
    // Create General customer or New customer - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a' `,[customer.acc_name,req.user.user_branch_id,customer.acc_id =='G'?'general':''])).then(res=>{
            return res;
        });
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
        let [cusEntyErr,cusEnty] =  await _p(db.insert('tbl_accounts',customerData)).then((row)=>{
            return row;
        })
        masterData.acc_id = cusEnty.insertId;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General customer or New customer - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.update('tbl_sales_order_master',masterData,{sale_o_id : para.sale_o_id})).then((row)=>{
            return row;
        });

    // Save Master Data - End
    // Delete Previous Detail data - start 

    // Old 
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

    // End
     await _p(db.delete(`tbl_sales_order_details`,{sale_o_id : para.sale_o_id}).then((res)=>{
        return res;
     }));


    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                sale_o_id: para.sale_o_id,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_sales_order_details',cartData)).then((row)=>{
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
    

    res.json({error:false,message:'Order updated Successfully.',sale_o_id: para.sale_o_id});
});


router.post('/api/update-sales-quotation',async(req,res,next)=>{  
    let para = req.body;
        let masterData = para.masterData;
        let customer = para.customer;
    // Create General customer or New customer - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
        let [existsErr,exists] =  await _p(db.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a' `,[customer.acc_name,req.user.user_branch_id,customer.acc_id =='G'?'general':''])).then(res=>{
            return res;
        });
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
        let [cusEntyErr,cusEnty] =  await _p(db.insert('tbl_accounts',customerData)).then((row)=>{
            return row;
        })
        masterData.acc_id = cusEnty.insertId;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General customer or New customer - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;

        let [masterEnrtyErr,masterEnrty] =  await _p(db.update('tbl_sales_quotation_master',masterData,{sale_o_id : para.sale_o_id})).then((row)=>{
            return row;
        });

    // Save Master Data - End
    // Delete Previous Detail data - start 

    // Old 
    let [detailsErr,details] =  await _p(db.query(` select serials from tbl_sales_quotation_details  where sale_o_id = ${para.sale_o_id} `)).then((row)=>{
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
     await _p(db.delete(`tbl_sales_quotation_details`,{sale_o_id : para.sale_o_id}).then((res)=>{
        return res;
     }));


    // Save Detail Data - Start
        para.itemCart.map(async(item)=>{
            let cartData = {
                sale_o_id: para.sale_o_id,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
            }
            await _p(db.insert('tbl_sales_quotation_details',cartData)).then((row)=>{
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
    

    res.json({error:false,message:'Quotation updated Successfully.',sale_o_id: para.sale_o_id});
});


router.post(`/api/sales-order-vouchers`,async(req,res,next)=>{
    let cluases = ` `
    if(req.body.query != undefined){
        cluases += ` and  som.sale_order_no like  '%${req.body.query}%'  `
    }

    if(req.body.query == ''){
        cluases += ` and  0=1  `
    }

    let [vouchersErr,vouchers] =  await _p(db.query(`select som.sale_o_id,som.sale_order_no as display_text
     from tbl_sales_order_master som
     where  som.branch_id = ? 
     ${cluases}
     and som.status != 'd'  `,
     [req.user.user_branch_id])).then(res=>{
        return res;
    });


    res.json(vouchers)
});



router.post('/api/get-sales-quotaion-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and sod.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select sod.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            som.sale_order_no,
            som.created_date,
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_sales_quotation_details  sod
            left join tbl_sales_quotation_master  som on som.sale_o_id  = sod.sale_o_id
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = sod.warehouse_id
            left join tbl_items it on it.item_id = sod.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  sod.status = 'a'
            and sod.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });

   

    res.json(details);
});

router.post('/api/get-sales-order-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and som.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and som.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and som.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and sod.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select sod.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            som.sale_order_no,
            som.created_date,
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_sales_order_details sod
            left join tbl_sales_order_master som on som.sale_o_id  = sod.sale_o_id
            left join tbl_accounts acc on acc.acc_id = som.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = sod.warehouse_id
            left join tbl_items it on it.item_id = sod.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  sod.status = 'a'
            and sod.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });

   

    res.json(details);
});



router.post('/api/create-sales',async(req,res,next)=>{  
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
        masterData.sale_voucher_no = await  getSaleVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id     =  para.orderId;
        let [masterEnrty, _]  = await Tran.create(`tbl_sales_master`,masterData,transaction)

        // EMI Save 
            for(emi of para.emis){
            emi.cus_id = masterData.acc_id;
            emi.branch_id = req.user.user_branch_id;
            emi.sale_id   = masterEnrty;
            await Tran.create(`tbl_emis`,emi,transaction)
        }
    // Save Master Data - End

    // If it order to purchase 
    // if(req.body.orderId != 0){
      //  await Tran.update(`tbl_sales_order_master`,{status:'c'},{sale_o_id:req.body.orderId},transaction)
    // }

    // Save Transaction
        for(pay of para.payCart){
         let payData = {
            voucher_type : 'sale',
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
                  // purchase rate entry check 
                  let getAvgRate = await Tran.selectByCond(`select  ifnull(average_rate,0) as average_rate from tbl_item_average_rate  where item_id=? and branch_id=?`,[item.item_id,req.user.user_branch_id], transaction)
                  let purchaseRate =  BigNumber(getAvgRate.length == 0?'0':getAvgRate[0].average_rate);

            let cartData = {
                sale_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id : para.orderId,
                purchase_average_rate : `${purchaseRate}`,
                serial_note : item.serial_note,
                per_unit_id : item.per_unit_id
            }
       
            // Save Serial Data - start
                for(serial of item.serials){
                let serialData = {
                    status: 'out'
                }
                await Tran.update(`tbl_item_serials`,serialData,{serial_number : serial.serial_number},transaction)
            }
            // Save Serial End - start
            await stockUpdate('sale_qty','plus',item.item_id,item.sale_qty,req.user.user_branch_id,item.warehouse_id,transaction)

          await Tran.create(`tbl_sales_details`,cartData,transaction)

        // Save Detail Data - End
        }

        await transaction.commit();


        // if(customer.contact_no.trim() != '' && para.is_smg == 'yes'){
        //     await axios.post(`https://mshastra.com/sendsms_api_json.aspx`,[{
        //         "user":"MamudEnter",
        //         "pwd":"uy4_u1u_",
        //         "number":"88"+customer.contact_no,
        //         "msg":para.msg,
        //         "sender":"8809617642241",
        //         "language":"Unicode/English"
        //     }]).then(res=>{
        //         console.log(res.data)
        //     })
        // }



        res.json({error:false,message:'Sale  created Successfully.',sale_id: masterEnrty});
       }
       catch (err) {
        await transaction.rollback();
        next(err);
       }


    

});



router.post('/api/get-sales-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.acc_type == 'customer'){
        cluases += ` and sm.acc_id = ${para.customer_id} `
    }

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and sm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sm.created_by = ${para.userId} `
    }

    if(para.employeeId != undefined && para.employeeId != null){
        cluases += ` and sm.employee_id = ${para.employeeId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null) && para.selectedFilterType != 'By Item Serial'){
        cluases += ` and sm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.sale_id != undefined && para.sale_id != null &&  para.sale_id != 0){
        cluases += ` and sm.sale_id = ${para.sale_id} `
    }

    if(para.selectedFilterType == 'By Condition Sale'){
        cluases += ` and sm.is_condition_sale = 'yes' `
    }

    if( para.sale_o_id == null && para.from =='voucher'){
        cluases += `  order by sm.sale_id desc limit 1 `
    }else{
        cluases += ` order by sm.sale_id desc `
    }

    let saleIdCluases = ``
    
    if(para.selectedFilterType != undefined && para.selectedFilterType != null &&  para.selectedFilterType == 'By Item Serial' ){
       
        let [saleErr,sale] =  await _p(db.query(`select sd.sale_id

        from tbl_sales_details sd
       
        where  sd.status = 'a'
        and   find_in_set(?,sd.serials) 
        `,[para.serialNumber])).then(res=>{
        return res;
        });
        if(sale.length != 0){
            saleIdCluases += ` and sm.sale_id = ${sale[0].sale_id} `
        }else{
            saleIdCluases += ` and sm.sale_id = 0 `

        }
    }


    let [masterDataErr,masterData] =  await _p(db.query(`select sm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,acc.party_type,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             sales_acc.acc_name as sales_acc_name,emp.employee_name,concat(emp.employee_name,' - ',emp.employee_code) as display_text,
             ins.pro_print_type,gp.component_name,gp.group_name,
             (
                select ifnull(sum(dr.rcv_total),0) as rcv_total from tbl_debitor_receipt_details dr 
                where dr.voucher_no = sm.sale_voucher_no and dr.status = 'a'
            ) as partialPaid,
            (
                select ifnull(sum(dr.discount_amount),0) as discount_amount from tbl_debitor_receipt_details dr 
                where dr.voucher_no = sm.sale_voucher_no and dr.status = 'a'
            ) as partial_discount,
            (
                select sm.paid_amount + partialPaid
            ) as paid_total,
            (
                select sm.total_amount - (paid_total + partial_discount)
            ) as due_total
            from tbl_sales_master sm
            left join tbl_employees emp on emp.employee_id  = sm.employee_id
            left join tbl_accounts sales_acc on sales_acc.acc_id = sm.sales_acc_id
            left join tbl_accounts acc on acc.acc_id = sm.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = sm.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = sm.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = sm.transport_acc_id
            left join tbl_users u on u.user_id = sm.created_by
            left join tbl_collection_groups gp on gp.group_id  = acc.group_id 
            left join tbl_institution_profile ins on ins.pro_branch_id = ${req.user.user_branch_id}
            where  sm.status = 'a'
            and sm.branch_id = ? 
            ${saleIdCluases}

            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }

   let data  =  masterData.map(async(detail)=>{
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
            `,[detail.sale_id])).then(res=>{
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
            where vt.voucher_type = 'sale' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.sale_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    });

    data = await  Promise.all(data)

    data =  data.map(async(row)=>{
        let [emisTransErr,emisTrans] =  await _p(db.query(`select emi.*
            from tbl_emis emi
            where  emi.status = 'a' 
            and  emi.sale_id =? order by emi.emi_no asc `,[row.sale_id])).then((row)=>{
                return row;
            });

            row.emis = emisTrans
            return row;
    });



    res.json(await  Promise.all(data));
});



router.post('/api/update-sales',async(req,res,next)=>{  


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


        delete masterData.sale_voucher_no 
        await Tran.update(`tbl_sales_master`,masterData,{sale_id : para.sale_id},transaction)
   
        await Tran.delete(`tbl_emis`,{sale_id : para.sale_id},transaction)

          // EMI Save 
            for(emi of para.emis){
            emi.cus_id = masterData.acc_id;
            emi.branch_id = req.user.user_branch_id;
            emi.sale_id   = para.sale_id;
            await Tran.create(`tbl_emis`,emi,transaction)
           }



    // Save Master Data - End


    await Tran.delete(`tbl_voucher_transactions`,{voucher_id : para.sale_id,voucher_type:'sale',status:'a'},transaction)


      // Save Transaction
        for(pay of para.payCart){
        let payData = {
           voucher_type : 'sale',
           voucher_id   : para.sale_id,
           to_acc_id  : pay.to_acc_id,
           tran_amount  : pay.tran_amount,
           from_acc_id    : masterData.acc_id,
        }
        await Tran.create(`tbl_voucher_transactions`,payData,transaction)
    }
   // End Transaction



    // Old 
    let details = await Tran.selectByCond(` select * from tbl_sales_details where sale_id =? and status='a' `,[para.sale_id], transaction)


    for(item of details){
        await stockUpdate('sale_qty','minus',item.item_id,item.sale_qty,item.branch_id,item.warehouse_id,transaction)
    }

    // End
    await Tran.delete(`tbl_sales_details`,{sale_id : para.sale_id},transaction)

    // Save Detail Data - Start
            for(item of para.itemCart){

              // purchase rate entry check 
              let getAvgRate = await Tran.selectByCond(` select ifnull(average_rate,0) as average_rate from tbl_item_average_rate  where item_id=? and branch_id=?  `,[item.item_id,req.user.user_branch_id], transaction)
       
              let purchaseRate =  BigNumber(getAvgRate.length == 0?'0':getAvgRate[0].average_rate);


            let cartData = {
                sale_id: para.sale_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
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
                sale_qty: item.sale_qty,
                sale_rate: item.sale_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  para.orderId,
                purchase_average_rate : `${purchaseRate}`,
                serial_note : item.serial_note ,
                per_unit_id : item.per_unit_id


            }
        
            // Save Serial Data - start
            await stockUpdate('sale_qty','plus',item.item_id,item.sale_qty,req.user.user_branch_id,item.warehouse_id,transaction)
            
            // Save Serial End - start
            await Tran.create(`tbl_sales_details`,cartData,transaction)

        // Save Detail Data - End
        }

        await transaction.commit();
        res.json({error:false,message:'Sales  updated Successfully.',sale_id: para.sale_id});
    
    }
    catch (err) {
        await transaction.rollback();
        next(err);
       }

});

router.post(`/api/sale-delete`,async(req,res,next)=>{

    let transaction; 
    try{
        transaction = await Tran.sequelize.transaction();
        let para = req.body;

    await Tran.update(`tbl_sales_master`,{status:'d'},{sale_id : para.sale_id},transaction)

    let details = await Tran.selectByCond(` select * from tbl_sales_details where sale_id = ? and status ='a' `,[para.sale_id], transaction)

    await Tran.update(`tbl_voucher_transactions`,{status:'d'},{voucher_id : para.sale_id,voucher_type:'sale'},transaction)

    for(detail of details){
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
          await Tran.update(`tbl_item_serials`,{status: 'in'},{serial_number: serial.serial_number},transaction)
        }
        // Stock Update
        await stockUpdate('sale_qty','minus',detail.item_id,detail.sale_qty,detail.branch_id,detail.warehouse_id,transaction)
    }


    await Tran.update(`tbl_sales_details`,{status:'d'},{sale_id : para.sale_id},transaction)
    

    await transaction.commit();

    res.json({error:false,message:'Sale  Deleted Successfully.'});

}
catch (err) {
        await transaction.rollback();
        next(err);
 }

})

router.post(`/api/sale-return-delete-check`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
   

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_sales_return_details   where sale_r_id=? and status = 'a' `,[para.sale_r_id], transaction)
   
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


router.post(`/api/sale-delete-check`,async(req,res,next)=>{

    transaction = await Tran.sequelize.transaction();

try{

    let para = req.body;
   

     // Old stock update
     let oldPurDetail = await Tran.selectByCond(`select * from tbl_sales_details   where sale_id=? and status = 'a' `,[para.sale_id], transaction)
   
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



router.post('/api/get-sales-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and sm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and sm.created_by = ${para.userId} `
    }

    if(para.employeeId != undefined && para.employeeId != null){
        cluases += ` and sm.employee_id = ${para.employeeId} `
    }


    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and sm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.acc_type == 'customer'){
        cluases += ` and sm.acc_id = ${para.customer_id} `
    }

    if(para.selectedFilterType == 'By Condition Sale'){
        cluases += ` and sm.is_condition_sale = 'yes' `
    }


    
    let [masterDataErr,masterData] =  await _p(db.query(`select sm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name,emp.employee_name,concat(emp.employee_name,' - ',emp.employee_code) as display_text,
    (
        select ifnull(sum(dr.rcv_total),0) as rcv_total from tbl_debitor_receipt_details dr 
        where dr.voucher_no = sm.sale_voucher_no and dr.status = 'a'
    ) as partialPaid,
    (
        select ifnull(sum(dr.discount_amount),0) as discount_amount from tbl_debitor_receipt_details dr 
        where dr.voucher_no = sm.sale_voucher_no and dr.status = 'a'
    ) as partial_discount,
    (
        select sm.paid_amount + partialPaid
    ) as paid_total,
    (
        select sm.total_amount - (paid_total + partial_discount)
    ) as due_total
            from tbl_sales_master sm
            left join tbl_accounts acc on acc.acc_id = sm.acc_id
            left join tbl_users u on u.user_id = sm.created_by
            left join tbl_employees emp on emp.employee_id = sm.employee_id
            where  sm.status != 'd'  
            and sm.branch_id = ? 
            ${cluases}
           
            order by sm.sale_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


    masterData =  masterData.map(async(row)=>{
        let [voucherTransErr,voucherTrans] =  await _p(db.query(`select vt.to_acc_id,vt.tran_amount,acc.acc_name as to_acc_name
            from tbl_voucher_transactions vt
            left join tbl_accounts acc on acc.acc_id = vt.to_acc_id
            where vt.voucher_type = 'sale' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.sale_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    });

    masterData = await  Promise.all(masterData)


    res.json(masterData);
});

router.post('/api/get-sales-amount',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

 

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and DATE(sm.created_date) between '${isoFromDate(para.fromDate)}' and '${isoFromDate(para.toDate)}' `
    }
   
    
    let [masterDataErr,masterData] =  await _p(db.query(`select ifnull(sum(sm.total_amount),0) as total_amount
            from tbl_sales_master sm
            where  sm.status != 'd'  
            and sm.branch_id = ? 
            ${cluases}
           
            order by sm.sale_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }





    res.json(masterData);
});

router.post('/api/get-sales-details',async(req,res,next)=>{  
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

    if(para.acc_type == 'customer'){
        cluases += ` and sm.acc_id = ${para.customer_id} `
    }

   
        let [detailsErr,details] =  await _p(db.query(`select sd.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            sm.sale_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_sales_details sd
            left join tbl_sales_master sm on sm.sale_id  = sd.sale_id
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



router.post('/api/create-sales-return',async(req,res,next)=>{  

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
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.sale_r_voucher_no = await  getSaleReturnVoucherNo(req,res,next);
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  0;

        let [masterEnrty, _]  = await Tran.create(`tbl_sales_return_master`,masterData,transaction)
    // Save Master Data - End

    // Save Detail Data - Start
            for(item of para.itemCart){
            let cartData = {
                sale_r_id: masterEnrty,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
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
                sale_r_qty: item.sale_r_qty,
                sale_r_rate: item.sale_r_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id : para.orderId,
                per_unit_id : item.per_unit_id
            }
       
            // Save Serial Data - start
            for(serial of item.serials){
                let serialData = {
                    status: 'in',
                }
                await Tran.update(`tbl_item_serials`,serialData,{serial_number: serial.serial_number},transaction)
            }
            // Save Serial End - start

            await Tran.create(`tbl_sales_return_details`,cartData,transaction)
            await stockUpdate('sale_return_qty','plus',item.item_id,item.sale_r_qty,req.user.user_branch_id,item.warehouse_id,transaction)

        // Save Detail Data - End
        }
        await transaction.commit();
        res.json({error:false,message:'Sale return created Successfully.',sale_r_id: masterEnrty});

        }
        catch (err) {
            await transaction.rollback();
            next(err);
        }
});


router.post('/api/get-sales-return-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and srm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and srm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and srm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }



    if(para.sale_r_id != undefined && para.sale_r_id != null &&  para.sale_r_id != 0){
        cluases += ` and srm.sale_r_id = ${para.sale_r_id} `
    }

    if( para.sale_r_id == null && para.from =='voucher'){
        cluases += `  order by srm.sale_r_id desc limit 1 `
    }else{
        cluases += ` order by srm.sale_r_id desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select srm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,
             discount_acc.acc_name as discount_acc_name,tax_acc.acc_name as tax_acc_name,transport_acc.acc_name as transport_acc_name,u.user_full_name,
             return_acc.acc_name as sales_return_acc_name
            from tbl_sales_return_master srm
            left join tbl_accounts return_acc on return_acc.acc_id = srm.sales_return_acc_id
            left join tbl_accounts acc on acc.acc_id = srm.acc_id
            left join tbl_accounts discount_acc on discount_acc.acc_id = srm.discount_acc_id
            left join tbl_accounts tax_acc on tax_acc.acc_id = srm.tax_acc_id
            left join tbl_accounts transport_acc on transport_acc.acc_id = srm.transport_acc_id
            left join tbl_users u on u.user_id = srm.created_by
            where  srm.status = 'a'
            and srm.branch_id = ? 
            ${cluases}
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }


   let data  =  masterData.map(async(detail)=>{
        let [itemDataErr,itemData] =  await _p(db.query(`select srd.*,it.item_name,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
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
            `,[detail.sale_r_id])).then(res=>{
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
            where vt.voucher_type = 'sale_return' and vt.status = 'a' 
            and  vt.voucher_id =? `,[row.sale_r_id])).then((row)=>{
                return row;
            });
            row.trans = voucherTrans
            return row;
    })



    res.json(await  Promise.all(data));
});






router.post('/api/update-sales-return',async(req,res,next)=>{  
  
    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();

    let para = req.body;
    let masterData = para.masterData;
    let customer = para.customer;


        
    // Create General Supplier or New Supplier - Start
    if(customer.acc_id == 'G' || customer.acc_id == 'N'){
        let exists = await Tran.countRows(`select acc_name from tbl_accounts where acc_name = ? and branch_id = ? and party_type!='general' and party_type==? and status = 'a' `,[customer.acc_name,req.user.user_branch_id,customer.acc_id =='G'?'general':''], transaction)
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
        let [suppEnty, _]  = await Tran.create(`tbl_accounts`,customerData,transaction)
        masterData.acc_id = suppEnty;
    }else{
        masterData.acc_id = customer.acc_id;
    }
    // Create General Supplier or New Supplier - End

    // Save Master Data - Start
        masterData.created_by   = req.user.user_id;  
        masterData.branch_id    = req.user.user_branch_id;
        masterData.order_id    =  0

         await Tran.update(`tbl_sales_return_master`,masterData,{sale_r_id : para.sale_r_id},transaction)

        // Save Master Data - End
        // Old 
        let details = await Tran.selectByCond(`select * from tbl_sales_return_details where sale_r_id = ? and status = 'a'`,[para.sale_r_id], transaction)

        for(item of details){
            await stockUpdate('sale_return_qty','minus',item.item_id,item.sale_r_qty,item.branch_id,item.warehouse_id,transaction)
        }

    // End
    await Tran.delete(`tbl_sales_return_details`,{sale_r_id : para.sale_r_id},transaction)

    // Save Detail Data - Start
        for(item of para.itemCart){
            let cartData = {
                sale_r_id: para.sale_r_id,
                serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                item_id: item.item_id,
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
                sale_r_qty: item.sale_r_qty,
                sale_r_rate: item.sale_r_rate,
                retail_qty: item.retail_qty,
                created_date : masterData.created_date,
                branch_id: req.user.user_branch_id,
                order_id  :  0,
                per_unit_id : item.per_unit_id

            }
        
            await stockUpdate('sale_return_qty','plus',item.item_id,item.sale_r_qty,req.user.user_branch_id,item.warehouse_id,transaction)

            await Tran.create(`tbl_sales_return_details`,cartData,transaction)
       
        // Save Detail Data - End
        }
    
        await transaction.commit();
        res.json({error:false,message:'Sale return  updated Successfully.',sale_r_id: para.sale_r_id});

        }
        catch (err) {
            await transaction.rollback();
            next(err);
           }

});


router.post('/api/get-sales-return-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and srm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and srm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and srm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select srm.*,acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no,u.user_full_name
            from tbl_sales_return_master srm
            left join tbl_accounts acc on acc.acc_id = srm.acc_id
            left join tbl_users u on u.user_id = srm.created_by
            where  srm.status != 'd'  
            and srm.branch_id = ? 
            ${cluases}
           
            order by srm.sale_r_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});



router.post('/api/get-sales-return-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

    if(para.customerId != undefined && para.customerId != null){
        cluases += ` and srm.acc_id = ${para.customerId} `
    }
    if(para.userId != undefined && para.userId != null){
        cluases += ` and srm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and srm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }

    if(para.locationId != undefined && para.locationId != null){
        cluases += ` and acc.location_id = ${para.locationId} `
    }

    if(para.itemId != undefined && para.itemId != null){
        cluases += ` and srd.item_id = ${para.itemId} `
    }

    if(para.groupId != undefined && para.groupId != null){
        cluases += ` and gp.group_id = ${para.groupId} `
    }

    if(para.categoryId != undefined && para.categoryId != null){
        cluases += ` and ct.category_id = ${para.categoryId} `
    }



   
        let [detailsErr,details] =  await _p(db.query(`select srd.*,it.item_name,it.item_code,it.is_serial,u.unit_name,u.unit_symbol,u.conversion,
            (
            select unit_symbol  from tbl_item_units   where unit_id = u.base_unit_id
            ) as base_unit_name,
            w.warehouse_name,
            srm.sale_r_voucher_no,
          
            acc.acc_name,
            loc.location_name,
            gp.group_id,
            gp.group_name,
            ct.category_id,
            ct.category_name
            from tbl_sales_return_details srd
            left join tbl_sales_return_master srm on srm.sale_r_id  = srd.sale_r_id
            left join tbl_accounts acc on acc.acc_id = srm.acc_id
            left join tbl_locations loc on loc.location_id = acc.location_id
            left join tbl_warehouses w on w.warehouse_id  = srd.warehouse_id
            left join tbl_items it on it.item_id = srd.item_id
            left join tbl_groups gp on gp.group_id  = it.group_id 
            left join tbl_categories ct on ct.category_id  = it.category_id 
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            where  srd.status = 'a'
            and srm.branch_id = ?
            ${cluases}
            `,[req.user.user_branch_id])).then(res=>{
            return res;
    });


    res.json(details);
});


router.post(`/api/sales-return-delete`,async(req,res,next)=>{

    let transaction; 
try{
    transaction = await Tran.sequelize.transaction();
    let para = req.body;

    await Tran.update(`tbl_sales_return_master`,{status:'d'},{sale_r_id : para.sale_r_id},transaction)

    let details = await Tran.selectByCond(`select * from tbl_sales_return_details where sale_r_id =? and status = 'a' `,[para.sale_r_id], transaction)

    for(detail of details){
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
            await Tran.update(`tbl_item_serials`,{status:'out'},{serial_number: serial.serial_number},transaction) 
        }

        // stock update
        await stockUpdate('sale_return_qty','minus',detail.item_id,detail.sale_r_qty,detail.branch_id,detail.warehouse_id,transaction)

    }

        await Tran.update(`tbl_sales_return_details`,{status:'d'},{sale_r_id : para.sale_r_id},transaction)

        await transaction.commit();
        
        res.json({error:false,message:'Sale return   created Successfully.',sale_r_id: para.sale_r_id});

        }
        catch (err) {
            await transaction.rollback();
            next(err);
           }
});



router.post(`/api/get-item-wise-profit`,async(req,res,next)=>{
    let cluases = ``

    if(req.body.itemId != undefined && req.body.itemId != null){
        cluases += ` and item.item_id = ${req.body.itemId} `
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


    let [serialsErr,serials] =  await _p(db.query(`
    select item.*,g.group_name,c.category_name,ifnull(unit.conversion,1) as conversion,unit.unit_symbol,
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
        select sold_amount - costing_amount
    ) as item_profit
    from  tbl_items item
    left join tbl_item_units unit on unit.unit_id = item.unit_id
    left join tbl_groups g on g.group_id = item.group_id   
    left join tbl_categories c on c.category_id = item.category_id


    where  item.status = 'a' ${cluases}      order by sold_amount desc

      `,[req.body.itemId,req.user.user_branch_id]).then((res)=>{
           return res;
     }));

        res.json(serials);
    });

router.post(`/api/get-available-serials`,async(req,res,next)=>{
    let [serialsErr,serials] =  await _p(db.query(`select serial_number from
      tbl_item_serials where 
      item_id = ?
      and branch_id = ? 
      ${req.body.warehouseId != undefined ? ` and warehouse_id = ${req.body.warehouseId} `: ''}
      and status = 'in'  
      `,[req.body.itemId,req.user.user_branch_id]).then((res)=>{
           return res;
     }));

     res.json(serials);
})

router.post(`/api/get-unavailable-serials`,async(req,res,next)=>{
    let [serialsErr,serials] =  await _p(db.query(`select serial_number from
      tbl_item_serials where 
      item_id = ?
      and branch_id = ? 
      ${req.body.warehouseId != undefined ? ` and warehouse_id = ${req.body.warehouseId} `: ''}
      and status = 'out'  
      `,[req.body.itemId,req.user.user_branch_id]).then((res)=>{
           return res;
     }));

     res.json(serials);
})

let getReplaceInv = async (req,res,next)=>{
    let [manuError,manu] =  await _p(db.query(`select replace_id   from tbl_replace_master
    
      order by replace_id   desc LIMIT 1`)).then(result=>{
        return result;
    });
    if(manuError){
        next(manuError)
    }
    let manuCode = '';
    if(manu.length == 0){
        manuCode = 'RP1';
    }else{
        manuCode = 'RP'+(parseFloat(manu[0].replace_id)+1);
    }
    return new Promise((resolve,reject)=>{
             resolve(manuCode)
    })
}


router.get('/api/get-replace-voucher-no',async(req,res,next)=>{  
    res.json(await  getReplaceInv(req,res,next));
});



router.post('/api/create-replace',async(req,res,next)=>{  
    let transaction; 
    try{
      transaction = await Tran.sequelize.transaction();
      let para = req.body;
          let masterData = para.masterData;
     
  
      // Save Master Data - Start
          masterData.voucher_no = await  getReplaceInv(req,res,next);
          masterData.created_by   = req.user.user_id;  
          masterData.branch_id    = req.user.user_branch_id;
          
          let [masterEnrty, _]  = await Tran.create(`tbl_replace_master`,masterData,transaction)
      // Save Master Data - End
  
      // Save Production item  Data - Start
            for(item of para.givenCart){
  
                // Previous  Stock Check 
                let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
                beforeStock = beforeStock[0].current_qty
                // End
  
              let cartData = {
                  replace_id: masterEnrty,
                  serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                  item_id: item.item_id,
                  per_unit_id: item.per_unit_id,
                  warehouse_id: item.warehouse_id,
                  item_qty: item.item_qty,
                 
                  item_rate: item.item_rate,
                  item_total: item.item_total,
                  item_percentage: item.item_percentage,
                
                  given_qty: item.given_qty,
                  given_rate: item.given_rate,
                  retail_qty: item.retail_qty,
                  created_date : masterData.created_date,
                  branch_id: req.user.user_branch_id,
              }
              await Tran.create(`tbl_given_items`,cartData,transaction)
          
                 /// Product Avarage Calculation
              // purchase rate entry check  
              
              await stockUpdate('replace_given_qty','plus',item.item_id,item.given_qty,req.user.user_branch_id,item.warehouse_id,transaction)
  
            //   await itemCostUpdate('plus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)
  
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
  
  
           // Save Production item  Data - Start
            for(item of para.returnCart){
              let returnCartData = {
                  replace_id: masterEnrty,
                  serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                  item_id: item.item_id,
                  per_unit_id: item.per_unit_id,
                  warehouse_id: item.warehouse_id,
                  return_item_qty: item.return_item_qty,
                 
                  return_item_rate: item.return_item_rate,
                  return_item_total: item.return_item_total,
                
                  return_qty: item.return_qty,
                  return_rate: item.return_rate,
                  return_retail_qty: item.return_retail_qty,
                  created_date : masterData.created_date,
                  branch_id: req.user.user_branch_id,
              }
              await Tran.create(`tbl_replace_return_items`,returnCartData,transaction)
  
              await stockUpdate('replace_return_qty','plus',item.item_id,item.return_qty,req.user.user_branch_id,item.warehouse_id,transaction)
  
  
              // Save Serial Data - start
                for(serial of item.serials){
                  let serialData = {
                      status: 'in',
                  }
                  await Tran.update(`tbl_item_serials`,serialData,{serial_number: serial.serial_number},transaction)
              }
              // Save Serial End - start
  
          // Production item - End
          }
      
      await transaction.commit();
      res.json({error:false,message:'Replace created Successfully.',replace_id: masterEnrty});
  
    }catch (err) {
          await transaction.rollback();
          next(err);
    }
  });


  router.post('/api/get-replace-record-with-details',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``

   
    if(para.userId != undefined && para.userId != null){
        cluases += ` and mm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and mm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
  



    if(para.replace_id  != undefined && para.replace_id  != null &&  para.replace_id  != 0){
        cluases += ` and mm.replace_id  = ${para.replace_id } `
    }

    if( para.replace_id  == null && para.from =='voucher'){
        cluases += `  order by mm.replace_id  desc limit 1 `
    }else{
        cluases += ` order by mm.replace_id  desc `
    }



    let [masterDataErr,masterData] =  await _p(db.query(`select mm.*,u.user_full_name,
            acc.acc_code,acc.acc_name,acc.institution_name,acc.address,acc.contact_no
            from tbl_replace_master mm
            left join tbl_accounts acc on acc.acc_id = mm.customer_id
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

            from tbl_replace_return_items mci
            left join tbl_warehouses w on w.warehouse_id  = mci.warehouse_id
            left join tbl_items it on it.item_id = mci.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = mci.per_unit_id 

            where  mci.status = 'a'
            and mci.replace_id = ? 
            `,[detail.replace_id])).then(res=>{
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

            from tbl_given_items mi
            left join tbl_warehouses w on w.warehouse_id  = mi.warehouse_id
            left join tbl_items it on it.item_id = mi.item_id
            left join tbl_item_units u on u.unit_id  = it.unit_id 
            left join tbl_item_units peru on peru.unit_id  = mi.per_unit_id 

            where  mi.status = 'a'
            and mi.replace_id = ? 
            `,[detail.replace_id])).then(res=>{
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



router.post('/api/update-replace',async(req,res,next)=>{  
    let transaction; 
    try{
      transaction = await Tran.sequelize.transaction();
  
      let para = req.body;
          let masterData = para.masterData;
      // Save Master Data - Start
  
          delete masterData.mf_voucher_no 
          let [masterEnrty, _] = await Tran.update(`tbl_replace_master`,masterData,{replace_id : masterData.replace_id},transaction)
      // Save Master Data - End
  
  
      // Old stock update
      let oldMDetail = await Tran.selectByCond(` select * from tbl_given_items   where replace_id=? and status='a' `,[masterData.replace_id], transaction)
  
        for(item of oldMDetail){
            // Previous  Stock Check
            let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
            beforeStock = beforeStock[0].current_qty
            // End
  
            await stockUpdate('replace_given_qty','minus',item.item_id,item.given_qty,item.branch_id,item.warehouse_id,transaction)
            // await itemCostUpdate('minus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
  
            }
  
        // Old 
        await Tran.delete(`tbl_given_items`,{replace_id : masterData.replace_id},transaction)
      // Save Production item  Data - Start
            for(item of para.givenCart){
  
               // Previous  Stock Check
               let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
               beforeStock = beforeStock[0].current_qty
               // End
  
  
              let cartData = {
                  replace_id: masterData.replace_id,
                  serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                  item_id: item.item_id,
                  per_unit_id: item.per_unit_id,
                  warehouse_id: item.warehouse_id,
                  item_qty: item.item_qty,
                 
                  item_rate: item.item_rate,
                  item_total: item.item_total,
                  item_percentage: item.item_percentage,
                
                  given_qty: item.given_qty,
                  given_rate: item.given_rate,
                  retail_qty: item.retail_qty,
                  created_date : masterData.created_date,
                  branch_id: req.user.user_branch_id,
              }
              await Tran.create(`tbl_given_items`,cartData,transaction)
  
               /// Product Avarage Calculation
              // purchase rate entry check 
              
              await stockUpdate('replace_given_qty','plus',item.item_id,item.given_qty,req.user.user_branch_id,item.warehouse_id,transaction)
  
            //   await itemCostUpdate('plus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,req.user.user_branch_id,item.warehouse_id,transaction)
  
  
          // Production item - End
          }
          let oldMConsumeDetail = await Tran.selectByCond(` select * from tbl_replace_return_items   where replace_id=? and status='a' `,[masterData.replace_id], transaction)
  
  
        for(item of oldMConsumeDetail){
        
        await stockUpdate('replace_return_qty','minus',item.item_id,item.return_item_qty,item.branch_id,item.warehouse_id,transaction)
  
        }
        await Tran.delete(`tbl_replace_return_items`,{replace_id : masterData.replace_id},transaction)
  
           // Save Production item  Data - Start
            for(item of para.returnCart){
              let returnCartData = {
                  replace_id: masterData.replace_id,
                  serials: item.serials != null || item.serials != undefined ? Array.prototype.map.call(item.serials, function(serial) { return serial.serial_number; }).join(",") : '',
                  item_id: item.item_id,
                  per_unit_id: item.per_unit_id,
                  warehouse_id: item.warehouse_id,
                  return_item_qty: item.return_item_qty,
                 
                  return_item_rate: item.return_item_rate,
                  return_item_total: item.return_item_total,
                
                  return_qty: item.return_qty,
                  return_rate: item.return_rate,
                  return_retail_qty: item.return_retail_qty,
                  created_date : masterData.created_date,
                  branch_id: req.user.user_branch_id,
              }
              await Tran.create(`tbl_replace_return_items`,returnCartData,transaction)
          
              await stockUpdate('replace_return_qty','plus',item.item_id,item.return_qty,req.user.user_branch_id,item.warehouse_id,transaction)
  
  
          // Production item - End
          }
      
      await transaction.commit();
      res.json({error:false,message:'Replace updated Successfully.',replace_id: masterData.replace_id});
      }catch (err) {
            await transaction.rollback();
            next(err);
      }
  });
  


  router.post('/api/get-product-replace-record',async(req,res,next)=>{  
    let para = req.body;
    let cluases = ``


    if(para.userId != undefined && para.userId != null){
        cluases += ` and mm.created_by = ${para.userId} `
    }

    if((para.fromDate != undefined && para.fromDate != null) && (para.toDate != undefined && para.toDate != null)){
        cluases += ` and mm.created_date between '${para.fromDate}' and '${para.toDate}' `
    }
   
   

    
    let [masterDataErr,masterData] =  await _p(db.query(`select mm.*,u.user_full_name
            from tbl_replace_master mm
            left join tbl_users u on u.user_id = mm.created_by
            where  mm.status != 'd'  
            and mm.branch_id = ? 
            ${cluases}
           
            order by mm.replace_id desc
             `,[req.user.user_branch_id])).then(res=>{
        return res;
    });
    if(masterDataErr && !masterData){
      next(masterDataErr)
    }
    res.json(masterData);
});


router.post(`/api/replace-delete`,async(req,res,next)=>{
    let transaction; 
    try{
      transaction = await Tran.sequelize.transaction();
  
      let replace_id = req.body.replace_id
      await Tran.update(`tbl_replace_master`,{status:'d'},{replace_id : replace_id},transaction)
  
       // Old stock update
       let oldMDetail = await Tran.selectByCond(`select * from tbl_given_items   where replace_id=? and status='a' `,[replace_id], transaction)
     
        for(item of oldMDetail){
            // Previous  Stock Check
            let beforeStock =  await  getStock(req,res,next,item.item_id,'',req.user.user_branch_id,item.warehouse_id,transaction);
            beforeStock = beforeStock[0].current_qty
            // End
            await stockUpdate('replace_given_qty','minus',item.item_id,item.given_qty,item.branch_id,item.warehouse_id,transaction)
            // await itemCostUpdate('minus',item.item_id,item.pd_qty,item.pd_rate,beforeStock,item.branch_id,item.warehouse_id,transaction)
        }
  
        // end
        let oldMItemDetail = await Tran.selectByCond(`select * from tbl_given_items   where replace_id=? and status='a' `,[replace_id], transaction)
      
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
            await Tran.update(`tbl_item_serials`,{status:'in'},{serial_number: serial.serial_number},transaction)
        }
      }
  
      await Tran.update(`tbl_given_items`,{status:'d'},{replace_id : replace_id},transaction)
  
      let oldMConsumeDetail = await Tran.selectByCond(`select * from tbl_replace_return_items   where replace_id=?  and status='a' `,[replace_id], transaction)
  
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
                  await Tran.update(`tbl_item_serials`,{status:'out'},{serial_number: serial.serial_number},transaction)
          }
  
          await stockUpdate('replace_return_qty','minus',detail.item_id,detail.return_qty,detail.branch_id,detail.warehouse_id,transaction)
      }
  
      await Tran.update(`tbl_replace_return_items`,{status:'d'},{replace_id : replace_id},transaction)
  
  
      await transaction.commit();
      res.json({error:false,message:'Replace deleted Successfully.'});
  
    }catch (err) {
          await transaction.rollback();
          next(err);
    }
  })


  router.post(`/api/get-sales-profit-loss`,async(req,res,next)=>{

    let clauses = ' ';
    let prodWiseClauses = ` `;

    if(req.body.customerId != undefined || req.body.customerId != null){
        clauses += ` and  cus.acc_id=${req.body.customerId} `;
    }

  

    if(req.body.fromDate != undefined && req.body.toDate != undefined ){
        clauses += ` and sm.created_date between '${req.body.fromDate}' and  '${req.body.toDate}' `;
    }

      let [salesErr,sales] = await _p(db.query(`select sm.*,cus.acc_name as customer_name,cus.acc_code as customer_code from 
      tbl_sales_master sm
          left join tbl_accounts cus on cus.acc_id = sm.acc_id
          where   sm.status = 'a' and sm.branch_id = ?  ${clauses}
       `,[req.user.user_branch_id]).then((result)=>{ 
               return result
       }));
       if(salesErr && !sales) return next(salesErr);
      
      let salesProfit =  sales.map(async(sale)=>{
           let[saleDetailErr,saleDetail] =  await _p(db.query(`select sd.*,p.item_code,
                    ifnull(sd.purchase_average_rate,0) as purchase_average_rate,
                    p.item_name,u.unit_name,
                    (ifnull(sd.purchase_average_rate,0) * sd.sale_qty) as purchasedAmount,
                    (select sd.item_total - purchasedAmount) as productProfitLoss
                    from tbl_sales_details sd
                    left join tbl_items p on p.item_id = sd.item_id
                    left join tbl_item_units u on p.unit_id = u.unit_id

                    where sd.sale_id = ?
             `,[sale.sale_id]).then((result)=>{
                 return result
             }))
             console.log(saleDetailErr)



             sale.details = saleDetail
             
             return sale
       });

       let result = await  Promise.all(salesProfit);

       
       console.log(salesErr)

       res.json(result);
})


module.exports = router;