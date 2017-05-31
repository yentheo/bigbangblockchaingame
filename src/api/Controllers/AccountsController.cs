using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Nethereum;
using Nethereum.Hex.HexTypes;
using Nethereum.RPC.Eth.DTOs;

namespace api.Controllers
{
    [Route("api/[controller]")]
    public class AccountsController : Controller
    {
        private BbbgContext _context;
        private IOptions<EthereumTransferAccount> _account;

        public AccountsController(BbbgContext context, IOptions<EthereumTransferAccount> account)
        {
            _context = context;
            _account = account;
        }
        
        [Authorize]
        public async Task<string> Post(string address)
        {
            var userId = new Guid(User.Claims.Single(cl => cl.Type == ClaimTypes.NameIdentifier).Value);
            var player = _context.Players.Single(x => x.Id == userId );
            player.Address = address;
            
            var web3 = new Nethereum.Web3.Web3();

            var txCount = await web3.Eth.Transactions.GetTransactionCount.SendRequestAsync(_account.Value.Address);
            var encoded = web3.OfflineTransactionSigner.SignTransaction(_account.Value.PrivateKey, address, 10, txCount.Value);

            return await web3.Eth.Transactions.SendRawTransaction.SendRequestAsync("0x" + encoded);
        }
    }
}
