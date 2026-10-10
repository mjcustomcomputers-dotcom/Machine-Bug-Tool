"""Strict synthetic multicommodity flow tests: conservation, arc capacity, loss."""
import importlib.util
import pathlib
import unittest

SRC=pathlib.Path(__file__).resolve().parents[1]/'solvers'/'barnhart2000'/'solve.py'
spec=importlib.util.spec_from_file_location('odimcf_solver', SRC)
solver=importlib.util.module_from_spec(spec);spec.loader.exec_module(solver)


def instance(demands, capacities):
    arcs=[{'arc_id':0,'from_node':0,'to_node':1,'capacity':capacities[0],'cost':0},
          {'arc_id':1,'from_node':1,'to_node':3,'capacity':capacities[0],'cost':0},
          {'arc_id':2,'from_node':0,'to_node':2,'capacity':capacities[1],'cost':0},
          {'arc_id':3,'from_node':2,'to_node':3,'capacity':capacities[1],'cost':0}]
    goods=[{'commodity_id':i,'origin':0,'destination':3,
            'demand':d,'revenue':value,'artificial_arc_cost':value}
           for i,(d,value) in enumerate(demands)]
    return {'network':{'num_nodes':4,'num_arcs':4,'nodes':[0,1,2,3],
                       'arcs':arcs},'commodities':{'num_commodities':len(goods),
                       'commodity_list':goods},'objective':'minimize'}


def verify_output(inp,output):
    arcs,adj,goods=solver.parse(inp)
    assert set(output)=={'objective_value','commodities'}
    assert len(output['commodities'])==len(goods)
    result={}
    for entry in output['commodities']:
        cid=entry['commodity_id']
        assert cid not in result
        assert isinstance(entry['rejected'],bool)
        assert (not entry['path_arcs']) if entry['rejected'] else True
        path=[]
        for arc in entry['path_arcs']:
            assert set(arc)=={'from','to','arc_id'}
            a=arcs[arc['arc_id']]
            assert arc['from']==a['from'] and arc['to']==a['to']
            path.append(arc['arc_id'])
        result[cid]=None if entry['rejected'] else tuple(path)
    assert set(result)=={c['id'] for c in goods}
    assert solver.verify(arcs,goods,result)
    assert abs(solver._route_objective(arcs,goods,result)-output['objective_value'])<1e-6


class MulticommodityTests(unittest.TestCase):
    def test_full_acceptance(self):
        data=instance([(4,20),(5,15),(3,25)],(5,10))
        result=solver.solve(data,7)
        verify_output(data,result)
        self.assertEqual(result['objective_value'],0)

    def test_capacity_competition_prefers_higher_value(self):
        data=instance([(5,20),(5,10),(5,40)],(5,5))
        result=solver.solve(data,7)
        verify_output(data,result)
        self.assertEqual(result['objective_value'],50.0)

    def test_all_reject_satisfies_capacity_and_contract(self):
        data=instance([(20,20),(15,10)],(4,5))
        result=solver.solve(data,4)
        verify_output(data,result)
        self.assertTrue(all(item['rejected'] for item in result['commodities']))

    def test_actual_cp_sat_pathset(self):
        from ortools.sat.python import cp_model
        self.assertTrue(cp_model)
        data=instance([(5,20),(5,10),(5,40)],(5,5))
        arcs,adj,goods=solver.parse(data)
        import time
        paths={c['id']:solver.route_paths(arcs,adj,c,time.monotonic()+2)
               for c in goods}
        choice=solver.optimize(arcs,goods,paths,time.monotonic()+6)
        self.assertIsNotNone(choice)
        self.assertTrue(solver.verify(arcs,goods,choice))
        self.assertEqual(solver._route_objective(arcs,goods,choice),50)


    def test_published_objective_ignores_real_arc_cost(self):
        # Independent oracle from the organizer's documented solution schema:
        # objective_value = total rejected-commodity artificial-arc penalty.
        # Previous tests assigned all real arcs cost=0 and hid the mismatch.
        for real_arc_cost in (0, 2.5, 10000):
            data=instance([(5,20),(5,10),(5,40)],(5,5))
            for arc in data['network']['arcs']:
                arc['cost']=real_arc_cost
            result=solver.solve(data,7)
            verify_output(data,result)
            decisions={entry['commodity_id']:entry for entry in result['commodities']}
            expected=sum(float(c['artificial_arc_cost'])*c['demand']
                         for c in data['commodities']['commodity_list']
                         if decisions[c['commodity_id']]['rejected'])
            self.assertAlmostEqual(result['objective_value'],expected,places=6)
            self.assertEqual(result['objective_value'],50.0)
            self.assertEqual(sum(not x['rejected'] for x in decisions.values()),2)

    def test_objective_metamorphic_under_arc_cost_perturbation(self):
        # Modify only physical transport arc costs; same feasible routes and
        # same rejection penalties. No change to the optimal objective.
        objs=[]
        for cost in (0, 1, 250, 1000000):
            data=instance([(4,11),(5,9)],(9,9))
            for arc in data['network']['arcs']:
                arc['cost']=cost
            output=solver.solve(data,5)
            verify_output(data,output)
            objs.append(output['objective_value'])
        self.assertTrue(all(value==0.0 for value in objs),objs)

    def test_positive_real_arc_cost_does_not_override_rejection_incentive(self):
        data=instance([(4,20)],(5,5))
        for arc in data['network']['arcs']:
            arc['cost']=1_000_000.0
        arcs,adj,goods=solver.parse(data)
        import time
        paths={c['id']:solver.route_paths(arcs,adj,c,time.monotonic()+2)
               for c in goods}
        selected=solver.optimize(arcs,goods,paths,time.monotonic()+5)
        self.assertIsNotNone(selected)
        self.assertTrue(solver.verify(arcs,goods,selected))
        self.assertEqual(solver._route_objective(arcs,goods,selected),0.0)

if __name__=='__main__':unittest.main()
